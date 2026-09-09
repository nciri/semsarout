import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft, FiImage, FiLayers, FiSliders, FiTarget } from 'react-icons/fi'
import * as local from '../../services/design3dLocal'
import * as api from '../../services/design3dApi'
import { applyLocal, refreshFromServer, remoteLevelId, startEngine } from '../../services/design3dSync'
import {
  EMPTY_GEOMETRY, newId, normalizedToMeters, polygonArea, rescaleGeometry, validateGeometry,
} from '../../utils/floorplan'
import useAuthStore from '../../store/authStore'
import useFloorplanEditor from '../../components/design/useFloorplanEditor'
import FloorplanCanvas from '../../components/design/FloorplanCanvas'
import Toolbar from '../../components/design/Toolbar'
import PropertiesPanel from '../../components/design/PropertiesPanel'
import LevelTabs from '../../components/design/LevelTabs'
import CalibrationOverlay from '../../components/design/CalibrationOverlay'
import SyncBadge from '../../components/design/SyncBadge'
import ShelfDialog from '../../components/design/ShelfDialog'
import Design3dGate from '../../components/design/Design3dGate'

/**
 * Éditeur de plan 2D, hors-ligne d'abord.
 *
 * Règles de fonctionnement qui expliquent la forme du composant :
 *  - Aucune action utilisateur n'attend le réseau. Toute mutation passe par
 *    `applyLocal` (IndexedDB + file d'attente) ; le moteur de synchronisation
 *    tourne en fond et n'est visible que par le badge.
 *  - Le rafraîchissement de fond ne réamorce JAMAIS l'éditeur. La géométrie
 *    n'est chargée depuis le local qu'au changement de niveau (`seededRef`),
 *    jamais sur simple mise à jour du store : sans cela, un rafraîchissement
 *    survenu pendant que l'utilisateur dessine ferait disparaître son brouillon
 *    sous ses doigts (cf. tâche 8).
 *  - L'enregistrement est différé de 500 ms et comparé à un instantané
 *    (`savedRef`) : ni sauvegarde à vide au chargement, ni perte au démontage
 *    (le dernier état en attente est écrit dans le nettoyage).
 */

const SAVE_DEBOUNCE_MS = 500
const FREE_EXTENT_M = 20 // largeur visible par défaut en dessin libre (sans plan importé)

const snapshotOf = (levelId, form, geometry) =>
  JSON.stringify({ id: levelId, name: form.name, wall_height_m: form.wall_height_m, calibration: form.calibration, geometry })

export default function DesignEditor() {
  const { t } = useTranslation(['dashboard'])
  const { projectId } = useParams()
  const hasFeature = useAuthStore((s) => s.hasFeature)
  const editor = useFloorplanEditor()
  const { state, dispatch, undo, redo, canUndo, canRedo } = editor

  const [levels, setLevels] = useState([])
  const [levelId, setLevelId] = useState(null)
  const [form, setForm] = useState({ name: '', wall_height_m: 2.7, calibration: null })
  const [sync, setSync] = useState({ state: 'synced', pending: 0 })
  const [background, setBackground] = useState(null)
  const [calibrating, setCalibrating] = useState(false)
  const [calPoints, setCalPoints] = useState([])
  const [shelf, setShelf] = useState(null)
  const [shelfCount, setShelfCount] = useState(0)
  const [menu, setMenu] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Niveau réellement chargé dans l'éditeur. Tant qu'il ne correspond pas à
  // `levelId`, l'amorçage (lecture IndexedDB, asynchrone) n'a pas encore rendu
  // la main : dessiner à ce moment-là serait perdu, le `LOAD_GEOMETRY` de
  // l'amorçage écrasant le tracé — l'outil reste donc désactivé jusque-là.
  const [readyLevelId, setReadyLevelId] = useState(null)
  // Échec de synchronisation du PROJET (création refusée) : distinct de celui
  // d'un niveau, et prioritaire — tant qu'il dure, aucun niveau ne partira.
  const [projectError, setProjectError] = useState(null)
  // Échec d'amorçage : 'read' (le stockage local n'a pas répondu) ou 'missing'
  // (le niveau n'y est plus). `seedAttempt` sert uniquement à relancer l'effet.
  const [seedError, setSeedError] = useState(null)
  const [seedAttempt, setSeedAttempt] = useState(0)

  const seededRef = useRef(null)
  const savedRef = useRef('')
  const pendingRef = useRef(null)
  const engineRef = useRef(null)
  const rootRef = useRef(null)

  // --- niveaux ------------------------------------------------------------
  const loadLevels = useCallback(async () => {
    const rows = (await local.listLevels(projectId)).filter((l) => !l.deleted)
    rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    // Cette relecture est aussi déclenchée par chaque état du moteur de
    // synchronisation (pour voir apparaître `sync_error`) : garder la même
    // référence quand rien n'a bougé évite d'inonder l'éditeur de rendus.
    setLevels((cur) => (JSON.stringify(cur) === JSON.stringify(rows) ? cur : rows))
    return rows
  }, [projectId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      let rows = await loadLevels()
      if (!rows.length) {
        // Rien en local : première ouverture sur cet appareil. On tente le
        // serveur, mais son échec n'empêche pas d'utiliser la page.
        try {
          await refreshFromServer()
          rows = alive ? await loadLevels() : rows
        } catch {
          return
        }
      }
      if (alive) setLevelId((cur) => cur ?? rows[0]?.id ?? null)
    })()
    return () => {
      alive = false
    }
  }, [loadLevels])

  // --- amorçage de l'éditeur (au changement de niveau UNIQUEMENT) ---------
  // L'amorçage conditionne tout : tant qu'il n'a pas abouti, l'éditeur reste
  // verrouillé (cf. `ready`). Un échec silencieux le verrouillerait donc pour
  // toujours — la lecture locale peut échouer (stockage indisponible, quota,
  // version) ou ne rien trouver (niveau supprimé ailleurs). Les deux cas sont
  // distingués, dits à l'utilisateur, et rejouables par `seedAttempt`.
  useEffect(() => {
    if (!levelId || seededRef.current === levelId) return undefined
    let alive = true
    ;(async () => {
      let lv
      try {
        lv = await local.getLevel(levelId)
      } catch {
        if (alive) setSeedError('read')
        return
      }
      if (!alive) return
      if (!lv) {
        setSeedError('missing')
        return
      }
      setSeedError(null)
      seededRef.current = levelId
      const nextForm = {
        name: lv.name || '',
        wall_height_m: Number(lv.wall_height_m) || 2.7,
        calibration: lv.calibration || null,
      }
      const geometry = lv.geometry || EMPTY_GEOMETRY
      savedRef.current = snapshotOf(levelId, nextForm, geometry)
      setForm(nextForm)
      dispatch({ type: 'LOAD_GEOMETRY', geometry, resetHistory: true })
      setReadyLevelId(levelId)
    })()
    return () => {
      alive = false
    }
  }, [levelId, dispatch, seedAttempt])

  // --- enregistrement local différé ---------------------------------------
  // Écrit l'édition en attente, quelle qu'en soit la cause : temporisation
  // échue, changement de niveau, démontage, onglet qui disparaît. Vide
  // `pendingRef` AVANT tout await pour qu'aucun de ces chemins ne puisse
  // enfiler deux fois la même édition, et avance `savedRef` pour que l'effet
  // différé ne la réenfile pas au rendu suivant.
  const flushPending = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    savedRef.current = p.snap
    // Le moteur n'est relancé qu'une fois l'écriture locale faite : plus tôt,
    // il ne trouverait pas encore l'opération dans la file.
    applyLocal({ type: 'level.update', payload: p.payload })
      .then(() => engineRef.current?.tick())
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!levelId || seededRef.current !== levelId) return undefined
    const payload = {
      id: levelId,
      name: form.name,
      wall_height_m: form.wall_height_m,
      calibration: form.calibration,
      geometry: state.geometry,
    }
    const snap = snapshotOf(levelId, form, state.geometry)
    if (snap === savedRef.current) return undefined
    pendingRef.current = { payload, snap }
    const timer = setTimeout(() => flushPending(), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [levelId, form, state.geometry, flushPending])

  // Tout ce qui n'a pas atteint la temporisation doit être écrit avant que
  // l'éditeur ne quitte le niveau : le nettoyage ci-dessus se contente
  // d'annuler le minuteur, et `pendingRef` — qui porte encore le payload de
  // l'ANCIEN niveau — était écrasé à la première édition sur le nouveau. Cet
  // effet-ci est cadencé sur `levelId` : son nettoyage part au changement de
  // niveau ET au démontage, mais jamais à chaque trait.
  useEffect(() => () => flushPending(), [levelId, flushPending])

  // Filet pour les sorties que React ne voit pas : fermeture d'onglet, passage
  // en arrière-plan, rechargement de page (main.jsx, RouteErrorBoundary) — le
  // démontage n'y a pas lieu.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushPending()
    }
    window.addEventListener('beforeunload', flushPending)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('beforeunload', flushPending)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [flushPending])

  // --- moteur de synchronisation -----------------------------------------
  useEffect(() => {
    const engine = startEngine({ onState: setSync })
    engineRef.current = engine
    return () => engine.stop()
  }, [])

  // --- échecs de synchronisation persistés --------------------------------
  // `sync_error` est écrit par le moteur sur l'entité locale à chaque échec non
  // rejouable (422/403/404/5xx). Sans cette relecture, il n'était lu par aucun
  // composant : l'agent voyait le badge repasser à « À jour » alors que son
  // niveau n'avait jamais atteint le serveur, sans message ni voie de reprise.
  // Relu à chaque état du moteur, donc dès que l'échec est consigné.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await loadLevels()
        const proj = await local.getProject(projectId)
        // Un projet dont la création a été refusée (403 de cible, cf. C3) n'est
        // jamais `synced` : ses niveaux ne partiront jamais, quelle que soit la
        // réédition. C'est la cause racine, elle prime sur l'erreur du niveau.
        const err = proj && !proj.synced ? (proj.sync_error ?? null) : null
        if (alive) setProjectError((cur) => (JSON.stringify(cur) === JSON.stringify(err) ? cur : err))
      } catch {
        // Le stockage local a son propre message (`seedError`) : ne pas le doubler.
      }
    })()
    return () => {
      alive = false
    }
  }, [loadLevels, projectId, sync])

  // Reprise manuelle : ré-enfile le niveau tel qu'il est en local (une édition
  // de plus, donc `dirty` à nouveau et trace d'échec effacée), puis relance le
  // moteur. Aucun contenu n'est touché — c'est bien le travail conservé sur
  // l'appareil qui repart.
  async function retryLevelSync() {
    if (!levelId) return
    await applyLocal({ type: 'level.update', payload: { id: levelId } })
    await loadLevels()
    engineRef.current?.tick()
  }

  // --- versions mises de côté (étagère, propriétaire seulement) -----------
  // Ces appels sortent du moteur de synchronisation : ils doivent traduire
  // eux-mêmes la clé locale en identité serveur, faute de quoi l'étagère du
  // niveau initial d'un projet répond 404 (cf. `remoteLevelId`).
  const refreshShelf = useCallback(async () => {
    if (!levelId || !navigator.onLine) return
    try {
      const { items } = await api.listShelf(await remoteLevelId(levelId))
      setShelfCount(items.length)
    } catch {
      setShelfCount(0)
    }
  }, [levelId])

  useEffect(() => {
    refreshShelf()
  }, [refreshShelf, sync.state])

  // --- image de fond ------------------------------------------------------
  useEffect(() => {
    if (!levelId) return undefined
    let url = null
    let alive = true
    ;(async () => {
      const bg = await local.getBackground(levelId)
      if (!bg || !alive) {
        setBackground(null)
        return
      }
      url = URL.createObjectURL(bg.blob)
      const img = new Image()
      img.onload = () => alive && setBackground({ url, aspect: img.naturalWidth / img.naturalHeight || 1 })
      img.src = url
    })()
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [levelId])

  async function importBackground(e) {
    const file = e.target.files?.[0]
    if (!file || !levelId) return
    await applyLocal({ type: 'level.background', payload: { id: levelId, blob: file, type: file.type } })
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => setBackground({ url, aspect: img.naturalWidth / img.naturalHeight || 1 })
    img.src = url
    setCalibrating(true)
    setCalPoints([])
  }

  // --- échelle ------------------------------------------------------------
  const imageSize = useMemo(() => {
    if (!background) return null
    if (!form.calibration) return { widthM: FREE_EXTENT_M, heightM: FREE_EXTENT_M / background.aspect }
    // `normalizedToMeters({x:1,y:0})` donne exactement la largeur de l'image en
    // mètres : on évite de redériver la formule de calibration ici.
    const widthM = normalizedToMeters({ x: 1, y: 0 }, form.calibration, background.aspect).x
    return { widthM, heightM: widthM / background.aspect }
  }, [background, form.calibration])

  const extentM = imageSize?.widthM || FREE_EXTENT_M
  const needsCalibration = !!background && !form.calibration
  const locked = needsCalibration && !calibrating
  // Amorçage terminé pour CE niveau ? Sinon rien n'est modifiable : la lecture
  // locale est asynchrone et son `LOAD_GEOMETRY` effacerait sans bruit ce qui
  // aurait été tracé entre-temps.
  const ready = !!levelId && readyLevelId === levelId

  function onCalibrationPoint(p) {
    setCalPoints((pts) => (pts.length >= 2 ? [p] : [...pts, p]))
  }

  function commitCalibration(meters) {
    if (calPoints.length < 2 || !background) return
    const next = { p1: calPoints[0], p2: calPoints[1], meters }
    if (form.calibration) {
      // Recalibrage : la géométrie déjà tracée doit suivre la nouvelle échelle,
      // exactement comme le fait le serveur (app/geometry.py::rescale).
      const before = normalizedToMeters({ x: 1, y: 0 }, form.calibration, background.aspect).x
      const after = normalizedToMeters({ x: 1, y: 0 }, next, background.aspect).x
      dispatch({ type: 'LOAD_GEOMETRY', geometry: rescaleGeometry(state.geometry, after / before) })
    }
    setForm((f) => ({ ...f, calibration: next }))
    setCalibrating(false)
    setCalPoints([])
  }

  // --- actions ------------------------------------------------------------
  async function addLevel() {
    const id = newId()
    await applyLocal({
      type: 'level.create',
      payload: {
        id,
        project_id: projectId,
        name: t('dashboard:designEditor.levels.newName', { n: levels.length }),
        position: levels.length,
        wall_height_m: 2.7,
        calibration: null,
        geometry: { ...EMPTY_GEOMETRY },
      },
    })
    await loadLevels()
    setLevelId(id)
  }

  // Reprise après un amorçage raté. La liste des niveaux est relue au passage :
  // si le niveau a disparu ailleurs, les onglets doivent refléter la réalité
  // pour que l'utilisateur puisse en choisir un autre.
  async function retrySeed() {
    setSeedError(null)
    try {
      await loadLevels()
    } catch {
      // Le stockage ne répond toujours pas : la nouvelle tentative
      // d'amorçage ci-dessous le dira, avec le même message.
    }
    setSeedAttempt((n) => n + 1)
  }

  function finishRoom() {
    if (state.draft?.kind !== 'room' || state.draft.points.length < 3) return
    dispatch({
      type: 'ADD_ROOM',
      room: { id: newId(), type: 'living', polygon: state.draft.points, name: '' },
    })
  }

  function zoomBy(factor) {
    dispatch({ type: 'SET_VIEW', view: { zoom: Math.min(40, Math.max(0.2, state.zoom * factor)) } })
  }

  function toggleOption(key) {
    if (key === 'grid') dispatch({ type: 'SET_OPTION', key: 'grid', value: { ...state.grid, visible: !state.grid.visible } })
    else dispatch({ type: 'SET_OPTION', key: 'dimensions', value: !state.dimensions })
  }

  function toggleFullscreen() {
    const el = rootRef.current
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
      setFullscreen(false)
      return
    }
    if (el?.requestFullscreen) {
      // Le repli (classe plein écran) couvre les navigateurs iOS qui refusent
      // l'API sur un élément quelconque.
      el.requestFullscreen().catch(() => {})
    }
    setFullscreen(true)
  }

  async function openShelf() {
    try {
      const { items } = await api.listShelf(await remoteLevelId(levelId))
      setShelf({ items, error: null })
    } catch {
      setShelf({ items: [], error: 'offline' })
    }
  }

  async function recoverShelf(item) {
    dispatch({ type: 'LOAD_GEOMETRY', geometry: item.geometry || EMPTY_GEOMETRY })
    setForm((f) => ({
      ...f,
      wall_height_m: Number(item.wall_height_m) || f.wall_height_m,
      calibration: item.calibration ?? f.calibration,
    }))
    try {
      await api.dismissShelf(await remoteLevelId(levelId), item.id)
    } catch {
      // Sans réseau la version reste sur l'étagère : ce n'est pas grave, elle
      // est déjà chargée dans l'éditeur et l'enregistrement suit la file.
    }
    setShelf(null)
    refreshShelf()
  }

  async function dismissShelfItem(item) {
    try {
      await api.dismissShelf(await remoteLevelId(levelId), item.id)
    } catch {
      return
    }
    setShelf((s) => ({ ...s, items: s.items.filter((i) => i.id !== item.id) }))
    refreshShelf()
  }

  // --- clavier (en plus des boutons, toujours visibles) -------------------
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement?.tagName === 'INPUT') return
        dispatch({ type: 'DELETE_SELECTED' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, dispatch])

  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 899px)')
    if (!mq) return undefined
    const apply = () => setCompact(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  const problems = useMemo(
    () => validateGeometry(state.geometry, form.wall_height_m),
    [state.geometry, form.wall_height_m],
  )
  const currentLevel = levels.find((l) => l.id === levelId)

  const toolbar = (
    <Toolbar
      tool={state.tool}
      onTool={(id) => dispatch({ type: 'SET_TOOL', tool: id })}
      onUndo={undo}
      onRedo={redo}
      canUndo={canUndo}
      canRedo={canRedo}
      onZoom={zoomBy}
      onDelete={() => dispatch({ type: 'DELETE_SELECTED' })}
      canDelete={!!state.selection}
      draft={state.draft}
      onFinishDraft={finishRoom}
      onCancelDraft={() => dispatch({ type: 'SET_DRAFT', draft: null })}
      dimensions={state.dimensions}
      grid={state.grid.visible}
      onToggle={toggleOption}
      fullscreen={fullscreen}
      onFullscreen={toggleFullscreen}
      disabled={locked || !ready}
      disabledReason={locked ? t('dashboard:designEditor.calibration.required') : null}
      vertical={!compact}
    />
  )

  const panel = (
    <PropertiesPanel
      state={state}
      dispatch={dispatch}
      wallHeightM={form.wall_height_m}
      onWallHeightChange={(v) => setForm((f) => ({ ...f, wall_height_m: v }))}
      problems={problems}
    />
  )

  return (
    <Design3dGate hasFeature={hasFeature('design3d')}>
      <div ref={rootRef} className={`bg-gray-50 ${fullscreen ? 'fixed inset-0 z-40 safe-top safe-inline safe-bottom' : ''}`}>
        <div className="flex flex-wrap items-center gap-3 p-3 border-b border-gray-200 bg-white">
          <Link to="/dashboard/conception" className="inline-flex items-center gap-2 text-gray-600 min-h-[44px]">
            <FiArrowLeft className="w-4 h-4 rtl:rotate-180" />
            {t('dashboard:designEditor.projects.back')}
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">{t('dashboard:designEditor.title')}</h1>
          <SyncBadge sync={sync} />
          {shelfCount > 0 && (
            <button type="button" className="btn-secondary min-h-[44px] inline-flex items-center gap-2" onClick={openShelf}>
              <FiLayers className="w-4 h-4" />
              {t('dashboard:designEditor.shelf.badge', { n: shelfCount })}
            </button>
          )}
          <label className="btn-secondary min-h-[44px] inline-flex items-center gap-2 cursor-pointer">
            <FiImage className="w-4 h-4" />
            {t('dashboard:designEditor.background.import')}
            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={importBackground} />
          </label>
          {background && (
            <button
              type="button"
              className="btn-secondary min-h-[44px] inline-flex items-center gap-2"
              onClick={() => {
                setCalibrating(true)
                setCalPoints([])
              }}
            >
              <FiTarget className="w-4 h-4" />
              {t('dashboard:designEditor.calibration.action')}
            </button>
          )}
        </div>

        {(projectError || currentLevel?.sync_error) && (
          <div
            role="alert"
            className="p-3 bg-red-50 border-b border-red-200 text-red-800 text-sm flex flex-wrap items-center gap-3"
          >
            <span>
              {projectError
                ? t('dashboard:designEditor.syncError.project', { message: projectError.message })
                : t('dashboard:designEditor.syncError.level', { message: currentLevel.sync_error.message })}
            </span>
            {/* Un refus de cible ne se lève pas en réessayant : ne proposer la
                reprise que là où elle peut aboutir. */}
            {!projectError && (
              <button type="button" className="btn-secondary min-h-[44px]" onClick={retryLevelSync}>
                {t('dashboard:designEditor.syncError.retry')}
              </button>
            )}
          </div>
        )}

        <div className="p-3 bg-white border-b border-gray-200">
          <LevelTabs
            levels={levels}
            currentId={levelId}
            onSelect={setLevelId}
            onCreate={addLevel}
            errorLabel={t('dashboard:designEditor.syncError.tab')}
          />
        </div>

        <div className={`flex ${compact ? 'flex-col' : 'flex-row'} gap-0`}>
          {!compact && <div className="p-3 bg-white border-e border-gray-200">{toolbar}</div>}

          <div className="relative flex-1 h-[60vh] sm:h-[70vh]">
            <FloorplanCanvas
              state={state}
              dispatch={dispatch}
              background={background?.url || null}
              imageSize={imageSize}
              extentM={extentM}
              locked={locked || !ready}
              calibration={calibrating ? { active: true, points: calPoints, onPoint: onCalibrationPoint } : { points: calPoints }}
              onLongPress={({ client, hit }) => {
                dispatch({ type: 'SELECT', selection: hit })
                setMenu(hit ? { client, hit } : null)
              }}
            />

            {/* Les deux bandeaux peuvent être vrais EN MÊME TEMPS : l'image de
                fond et le niveau sont deux lectures IndexedDB indépendantes, si
                bien qu'un fond orphelin (niveau supprimé, quota partiel) donne
                `locked` alors que l'amorçage a échoué. Superposés en absolu ils
                se masquaient l'un l'autre, et l'erreur — donc son bouton de
                reprise, seule sortie du verrou — devenait inatteignable. Ils
                sont donc empilés dans un seul conteneur, l'erreur d'abord. */}
            {(seedError || locked) && (
              <div className="absolute inset-x-0 top-0">
                {seedError && (
                  <div
                    role="alert"
                    className="p-3 bg-red-50 border-b border-red-200 text-red-800 text-sm flex flex-wrap items-center gap-3"
                  >
                    <span>{t(`dashboard:designEditor.seedError.${seedError}`)}</span>
                    <button type="button" className="btn-secondary min-h-[44px]" onClick={retrySeed}>
                      {t('dashboard:designEditor.seedError.retry')}
                    </button>
                  </div>
                )}

                {locked && (
                  <div className="p-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
                    {t('dashboard:designEditor.calibration.required')}
                  </div>
                )}
              </div>
            )}

            {calibrating && (
              <CalibrationOverlay
                points={calPoints}
                meters={form.calibration?.meters}
                required={needsCalibration}
                onReset={() => setCalPoints([])}
                onCancel={() => setCalibrating(false)}
                onCommit={commitCalibration}
              />
            )}

            {menu && (
              <div
                className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-2 space-y-1"
                style={{ left: Math.max(8, menu.client.x - 80), top: Math.max(8, menu.client.y - 60) }}
              >
                <button
                  type="button"
                  className="block w-full text-start min-h-[44px] px-3 rounded hover:bg-gray-50"
                  onClick={() => {
                    setSheetOpen(true)
                    setMenu(null)
                  }}
                >
                  {t('dashboard:designEditor.menu.properties')}
                </button>
                <button
                  type="button"
                  className="block w-full text-start min-h-[44px] px-3 rounded text-red-600 hover:bg-red-50"
                  onClick={() => {
                    dispatch({ type: 'DELETE_SELECTED' })
                    setMenu(null)
                  }}
                >
                  {t('dashboard:designEditor.menu.delete')}
                </button>
                <button
                  type="button"
                  className="block w-full text-start min-h-[44px] px-3 rounded hover:bg-gray-50"
                  onClick={() => setMenu(null)}
                >
                  {t('dashboard:designEditor.menu.close')}
                </button>
              </div>
            )}
          </div>

          {!compact && <aside className="w-80 p-3 bg-white border-s border-gray-200 overflow-y-auto">{panel}</aside>}
        </div>

        {compact && (
          <>
            {/* La barre collante est hors du flux normal de la page : elle porte
                elle-même les marges de zone sûre, sinon elle passe sous la
                barre d'accueil de la tablette. */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 safe-inline safe-bottom">
              <div className="p-2 overflow-x-auto">{toolbar}</div>
            </div>
            <div className="bg-white border-t border-gray-200">
              <button
                type="button"
                className="w-full min-h-[44px] flex items-center justify-center gap-2 text-gray-700"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen((v) => !v)}
              >
                <FiSliders className="w-4 h-4" />
                {t('dashboard:designEditor.panel.title')}
              </button>
              {sheetOpen && <div className="p-3 max-h-[40vh] overflow-y-auto">{panel}</div>}
            </div>
          </>
        )}

        {currentLevel && (
          <p className="p-3 text-xs text-gray-500">
            {t('dashboard:designEditor.footer', {
              level: currentLevel.name,
              area: state.geometry.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0).toFixed(1),
            })}
          </p>
        )}

        {shelf && (
          <ShelfDialog
            items={shelf.items}
            onRecover={recoverShelf}
            onDismiss={dismissShelfItem}
            onClose={() => setShelf(null)}
          />
        )}
      </div>
    </Design3dGate>
  )
}

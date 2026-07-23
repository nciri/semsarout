# Spec — Dashboard enrichi : tour de contrôle + hub Analyses

**Date :** 2026-07-23
**Brique :** 3 / 8 de la refonte
**Statut :** validé, prêt pour le plan d'implémentation
**Dépend de :** brique 1 (rôles/permissions), brique 2 (équipes, service `seats`).

---

## 1. Contexte & vision

Aujourd'hui deux surfaces pauvres : la page d'accueil **`/dashboard`** (compteurs basiques : annonces, vues, leads)
et une page **`/backoffice/statistiques`** avec des graphiques CSS faits main (overview, agent-performance,
funnel, price-distribution). Aucune **analyse financière** (le modèle `Transaction` porte pourtant prix de vente,
`commission_amount`, funnel de dates, `expected_closing_date`) ni **analyse de marché** (le modèle
`NeighborhoodPriceRef` existe mais n'est pas exploité en analyse).

**Vision (validée) — deux surfaces complémentaires, pas redondantes :**
- **`/dashboard` = tour de contrôle** 🗼 : point d'entrée unique de l'app. Une grille de **widgets de synthèse**
  agrégeant l'essentiel de partout (financier, pipeline, leads, annonces, marché, équipe/sièges, alertes), chacun
  = un chiffre-clé + un lien « voir plus → ». **Configurable** par l'utilisateur (réordonner / masquer, persisté).
- **`/backoffice/analyses` = hub Analyses** 🔬 : la profondeur. Onglets **Finance / Marché / Pipeline / Équipe**
  avec de vrais graphiques (Recharts).

**Principe anti-duplication :** chaque endpoint d'analyse expose un bloc `summary` compact ; la tour de contrôle
consomme ces `summary`, le hub consomme le détail. Une seule logique de calcul.

## 2. Décisions validées
| Sujet | Décision |
|-------|----------|
| Emplacement | Tour de contrôle sur `/dashboard` + hub « Analyses » dans `/backoffice` |
| Graphiques | **Recharts** (nouvelle dépendance) |
| Modules d'analyse | **Les 4** : Finance, Marché, Pipeline, Équipe & leads |
| Tour de contrôle | Complète **+ config** (réordonner/masquer, persistée par utilisateur) |
| Visibilité selon rôle | Agent simple → ses chiffres ; propriétaire/manager → toute l'agence |

## 3. Visibilité selon le rôle (source unique)

Helper `analytics_scope(user, agency) -> {'all': bool, 'agent_id': int|None}` dans un service partagé :
- **Vue agence** (`all=True`) si `user.id == agency.owner_id` **ou** un rôle porte la permission
  `analytics.view_all` (nouvelle permission, seedée sur les rôles `admin` et `manager`).
- Sinon **vue perso** (`all=False`, `agent_id=user.id`) : transactions où `agent_id == user.id`, leads
  `assigned_to_id == user.id`, annonces `owner_id == user.id`.
Tous les endpoints appliquent ce scope. Réutilise l'infra rôles/permissions existante (brique 1).

## 4. Modèle de données
Un seul ajout : `User.dashboard_config` (JSON, nullable) — layout de la tour de contrôle par utilisateur
(`{"widgets": [{"id": "financial", "order": 0, "hidden": false}, ...]}`). Migration `add_user_dashboard_config`
(nullable, rétro-compatible). Aucune autre table : les analyses sont calculées à la volée sur les modèles
existants (`Transaction`, `Lead`, `Property`, `NeighborhoodPriceRef`, `Program`, `Subscription`).

## 5. API — `backend/app/api/v1/backoffice/analytics.py`

Nouveau module (routes sous `/backoffice`, `require_auth` → `g.agency_id`, scope §3). Chaque endpoint accepte
`?range=` (`30d`/`90d`/`12m`/`ytd`, défaut `12m`) et renvoie `{ "summary": {...}, "detail": {...} }`.

### 5.1 `GET /backoffice/analytics/financial`
- `summary` : `revenue_realized` (Σ `commission_amount` des transactions `status='won'`/clôturées sur la période),
  `revenue_pipeline_weighted` (Σ commission estimée × probabilité de l'étape, cf. §6), `deals_won`, `deals_lost`,
  `avg_deal_size` (moy. `final_price`), `avg_sales_cycle_days` (moy. `closing_date - contact_date`).
- `detail` : `revenue_trend` (série mensuelle CA réalisé + pondéré), `commission_by_agent`, `commission_by_month`,
  `win_loss_by_month`, `deals_by_type` (vente/location).

### 5.2 `GET /backoffice/analytics/market`
- `summary` : `portfolio_avg_price_sqm`, `market_avg_price_sqm` (réf. `NeighborhoodPriceRef` pondérée par
  le portefeuille), `price_gap_pct` (portefeuille vs marché), `avg_days_on_market`
  (`now - published_at` des annonces actives), `absorption_rate` (vendus / (actifs+vendus) sur la période).
- `detail` : `price_sqm_by_neighborhood` (portefeuille vs marché), `days_on_market_distribution`,
  `portfolio_valuation_by_city`, `inventory_by_status`.

### 5.3 `GET /backoffice/analytics/pipeline`
- `summary` : `funnel` (leads → qualifiés → visites → offres → clôturés), `conversion_overall_pct`,
  `expected_closings_30d` (nb + valeur, via `expected_closing_date`), `pipeline_value_open`.
- `detail` : `funnel_stages` (nb + valeur par étape), `conversion_by_stage`, `stage_velocity_days`
  (moy. jours par étape via les dates du modèle `Transaction`), `expected_closings_timeline`.

### 5.4 `GET /backoffice/analytics/team`
- `summary` : `top_agents` (deals + commission + conversion), `lead_sources` (leads/converted/coût),
  `cost_per_lead`, `best_source`.
- `detail` : `agent_performance` (par agent : deals, CA, commission, conversion, cycle moyen),
  `lead_roi_by_source` (leads, convertis, `Σ charge_amount`, ROI), `conversion_by_source`, `conversion_by_service`.
- Vue agence uniquement (un agent simple voit `top_agents` limité à lui-même).

### 5.5 `GET /backoffice/analytics/overview` (tour de contrôle)
Agrège les `summary` des 4 modules **plus** : `listings` (actives/vues), `hot_leads` (non lus + en retard,
réutilise la logique de badge leads existante), `seats` (via le service `seats` de la brique 2),
`subscription` (plan, statut), `alerts` (leads en retard, deals à clôturer sous 7 j, stock faible). Renvoie aussi
`config` (le `dashboard_config` de l'utilisateur, ou un défaut). **Un seul appel** pour peindre la tour.

### 5.6 Config de la tour
`GET /backoffice/dashboard/config` · `PUT /backoffice/dashboard/config` `{widgets:[{id,order,hidden}]}` →
valide les ids contre le registre de widgets connu, persiste dans `User.dashboard_config`.

## 6. Probabilités de pipeline (pondération financière)
Table de probabilité par étape (constante backend, documentée), ex. : `contact 10%`, `qualified 25%`,
`visit 40%`, `offer 60%`, `compromise 85%`, `won 100%`, `lost 0%`. `revenue_pipeline_weighted` =
Σ (commission estimée du deal × proba de son étape) sur les transactions ouvertes. Les valeurs sont un
paramètre unique réutilisé partout.

## 7. Front

### 7.1 Dépendance & kit graphique
- Ajouter `recharts`. Suivre le skill **dataviz** pour palette/altitude/accessibilité (thème clair/sombre).
- Kit réutilisable `frontend/src/components/analytics/` : `KpiTile`, `TrendLine`, `BarsChart`, `DonutChart`,
  `FunnelBars`, `ChartCard` (titre + état vide + skeleton). Palette centralisée, responsive, `overflow-x` sur
  les conteneurs larges.

### 7.2 Hub Analyses `/backoffice/analyses`
- `AnalyticsLayout` : onglets Finance / Marché / Pipeline / Équipe + sélecteur de période (`range`).
- 4 pages (`FinancialAnalytics`, `MarketAnalytics`, `PipelineAnalytics`, `TeamAnalytics`) consommant le `detail`
  de leur endpoint : KPIs en haut + graphiques Recharts + tableaux. Entrée de menu backoffice « Analyses ».

### 7.3 Tour de contrôle `/dashboard` (refonte de `Dashboard.jsx`)
- **Un** appel `GET /backoffice/analytics/overview` → grille de widgets. Registre de widgets (id → composant +
  titre + lien « voir plus »). Chaque widget = carte compacte (chiffre-clé, mini-tendance éventuelle, lien).
- Widgets : `financial`, `pipeline`, `hot_leads`, `listings`, `market`, `team_seats`, `subscription`, `alerts`.
- **Mode édition** : bouton « Personnaliser » → réordonner par **glisser-déposer natif HTML5** (attribut
  `draggable`, aucune nouvelle dépendance) + interrupteurs masquer/afficher ; « Enregistrer » → `PUT config`.
  L'ordre/masquage vient de `config` (défaut si absent).
- Chaque widget respecte déjà le scope rôle (données fournies par l'overview).

### 7.4 Service
`frontend/src/services/analyticsService.js` : `getFinancial/getMarket/getPipeline/getTeam(range)`,
`getOverview()`, `getConfig()`, `saveConfig(widgets)`. Via l'instance `api` partagée.

## 8. Seed & permission
- Seed `analytics.view_all` (module `analytics`) et l'attribuer aux rôles `admin` et `manager`.
- S'assurer qu'il existe des `Transaction` seedées avec `commission_amount`/dates variées pour que les analyses
  aient de la matière (compléter `seed_backoffice.py` si nécessaire). Tout endpoint doit renvoyer des zéros/États
  vides proprement si aucune donnée.

## 9. Tests (avant « terminé »)
**Backend (scripts Python)** : pour un compte owner/manager (vue agence) et un agent simple (vue perso) —
- chaque endpoint renvoie la forme `{summary, detail}` attendue et applique le bon scope (l'agent ne voit que ses
  transactions/leads) ; `range` filtre correctement ;
- financier : `revenue_realized` = Σ commissions won sur la période ; pondéré cohérent avec les probabilités ;
- marché : `price_gap_pct` et `avg_days_on_market` calculés ; absorption bornée [0,1] ;
- pipeline : le funnel décroît (leads ≥ … ≥ clôturés) ; conversions dans [0,1] ;
- overview : agrège sans erreur même DB quasi vide ; renvoie `config` ;
- config : `PUT` valide les ids et persiste ; `PUT` avec un id inconnu → 400.
**Frontend** : `/backoffice/analyses` (4 onglets) et `/dashboard` renvoient 200 ; build prod OK ; smoke test :
graphiques rendus, mode édition (réordonner + masquer + enregistrer) persiste après reload.

## 10. Fichiers touchés (indicatif)
- **Backend** : `models/user.py` (+`dashboard_config`), migration `add_user_dashboard_config`,
  `services/analytics_scope.py` (new), `api/v1/backoffice/analytics.py` (new) + enregistrement dans
  `backoffice/__init__.py`, `seed_backoffice.py` (permission `analytics.view_all` + transactions de démo),
  `scripts/verify_analytics_*.py`.
- **Frontend** : `package.json` (recharts), `components/analytics/*` (kit), `pages/backoffice/analytics/*`
  (hub + 4 pages), `pages/dashboard/Dashboard.jsx` (refonte tour de contrôle) + registre de widgets
  `components/dashboard/widgets/*`, `services/analyticsService.js`, câblage routeur + menu backoffice.

## 11. Séquencement (pour le plan)
Phasé pour livrer par incréments testables : (1) fondations — recharts + kit + migration `dashboard_config` +
blueprint analytics + helper de scope ; (2) module Finance ; (3) Marché ; (4) Pipeline ; (5) Équipe & leads ;
(6) overview agrégé ; (7) tour de contrôle + config ; (8) vérif intégrée + build.

---

## Annexe — décomposition globale
0. ❤️ Cœur — livré · 1. 🛡️ Super-admin — livré · 2. 👥 Équipes & sièges — livré ·
**3. 📊 Dashboard enrichi — cette spec** · 4. 📄 Contrats · 5. ⚖️ Juridique & notaires · 6. 🔧 Artisans ·
7. 🛋️ Marketplace meubles.

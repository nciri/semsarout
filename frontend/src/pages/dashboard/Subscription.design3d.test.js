import { describe, it, expect } from 'vitest'
import frDashboard from '../../locales/fr/dashboard.json'
import arDashboard from '../../locales/ar/dashboard.json'
import { AGENCY_PLANS } from './subscriptionPlans'

// I14 : le module design3d (add-on payant) n'apparaissait nulle part sur la page
// d'abonnement — le parcours d'activation (Design3dGate, Design3dEntry) renvoie ici,
// mais rien n'y mentionnait le module. Positionnement retenu, aligné sur
// `services/billing/app/seed.py` (has_design3d) : inclus dans les plans agence
// pro/enterprise, absent de starter — même patron que les autres fonctionnalités
// de cette page (tableau `featuresIncluded` en dur, positionnellement aligné sur
// le tableau i18n `features`).
const DESIGN3D_LABEL_FR = 'Conception 3D des plans'

describe('module design3d sur la page abonnement', () => {
  it('figure dans les features (FR et AR) des plans agence, à la même position', () => {
    for (const locale of [frDashboard, arDashboard]) {
      const agency = locale.subscription.plans.agency
      for (const planId of ['starter', 'pro', 'enterprise']) {
        expect(agency[planId].features.length).toBeGreaterThan(0)
      }
    }
    const frAgency = frDashboard.subscription.plans.agency
    for (const planId of ['starter', 'pro', 'enterprise']) {
      expect(frAgency[planId].features).toContain(DESIGN3D_LABEL_FR)
    }
  })

  it('featuresIncluded a la même longueur que la liste i18n de features, pour chaque plan agence', () => {
    for (const plan of AGENCY_PLANS) {
      const features = frDashboard.subscription.plans.agency[plan.id].features
      expect(plan.featuresIncluded.length, plan.id).toBe(features.length)
    }
  })

  it('design3d est inclus en pro/enterprise, pas en starter — comme has_design3d (billing seed.py)', () => {
    const byId = Object.fromEntries(AGENCY_PLANS.map((p) => [p.id, p]))
    const design3dIndex = frDashboard.subscription.plans.agency.starter.features
      .indexOf(DESIGN3D_LABEL_FR)
    expect(design3dIndex).toBeGreaterThanOrEqual(0)

    expect(byId.starter.featuresIncluded[design3dIndex]).toBe(false)
    expect(byId.pro.featuresIncluded[
      frDashboard.subscription.plans.agency.pro.features.indexOf(DESIGN3D_LABEL_FR)
    ]).toBe(true)
    expect(byId.enterprise.featuresIncluded[
      frDashboard.subscription.plans.agency.enterprise.features.indexOf(DESIGN3D_LABEL_FR)
    ]).toBe(true)
  })
})

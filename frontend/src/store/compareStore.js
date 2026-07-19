import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const MAX_COMPARE = 3

const useCompareStore = create(
  persist(
    (set, get) => ({
      propertyIds: [],

      toggle: (propertyId) => {
        const { propertyIds } = get()
        if (propertyIds.includes(propertyId)) {
          set({ propertyIds: propertyIds.filter((id) => id !== propertyId) })
          return true
        }
        if (propertyIds.length >= MAX_COMPARE) {
          return false
        }
        set({ propertyIds: [...propertyIds, propertyId] })
        return true
      },

      remove: (propertyId) => {
        set({ propertyIds: get().propertyIds.filter((id) => id !== propertyId) })
      },

      clear: () => set({ propertyIds: [] }),

      isSelected: (propertyId) => get().propertyIds.includes(propertyId)
    }),
    { name: 'semsarout-compare' }
  )
)

export const MAX_COMPARE_PROPERTIES = MAX_COMPARE
export default useCompareStore

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FiX, FiChevronLeft, FiChevronRight, FiZoomIn, FiZoomOut } from 'react-icons/fi'
import DirIcon from './DirIcon'

export default function PhotoLightbox({
  images = [],
  initialIndex = 0,
  isOpen = false,
  onClose = () => {}
}) {
  const { t } = useTranslation(['common'])
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isZoomed, setIsZoomed] = useState(false)

  // Reset index when lightbox opens with a new initial index
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex)
      setIsZoomed(false)
    }
  }, [isOpen, initialIndex])

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return

    switch (e.key) {
      case 'Escape':
        onClose()
        break
      case 'ArrowLeft':
        setCurrentIndex(prev => prev === 0 ? images.length - 1 : prev - 1)
        break
      case 'ArrowRight':
        setCurrentIndex(prev => prev === images.length - 1 ? 0 : prev + 1)
        break
      default:
        break
    }
  }, [isOpen, images.length, onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen || images.length === 0) return null

  const currentImage = images[currentIndex]

  const goToPrevious = (e) => {
    e.stopPropagation()
    setCurrentIndex(prev => prev === 0 ? images.length - 1 : prev - 1)
    setIsZoomed(false)
  }

  const goToNext = (e) => {
    e.stopPropagation()
    setCurrentIndex(prev => prev === images.length - 1 ? 0 : prev + 1)
    setIsZoomed(false)
  }

  const toggleZoom = (e) => {
    e.stopPropagation()
    setIsZoomed(prev => !prev)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
        title={t('common:lightbox.close')}
      >
        <FiX className="w-8 h-8" />
      </button>

      {/* Zoom button */}
      <button
        onClick={toggleZoom}
        className="absolute top-4 right-16 z-10 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
        title={isZoomed ? t('common:lightbox.zoomOut') : t('common:lightbox.zoomIn')}
      >
        {isZoomed ? <FiZoomOut className="w-6 h-6" /> : <FiZoomIn className="w-6 h-6" />}
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-4 text-white/70 text-sm font-medium bg-black/30 px-3 py-1.5 rounded-full">
        {currentIndex + 1} / {images.length}
      </div>

      {/* Navigation arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors"
            title={t('common:lightbox.previous')}
          >
            <DirIcon icon={FiChevronLeft} className="w-8 h-8" />
          </button>
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors"
            title={t('common:lightbox.next')}
          >
            <DirIcon icon={FiChevronRight} className="w-8 h-8" />
          </button>
        </>
      )}

      {/* Main image */}
      <div
        className={`relative max-w-full max-h-full p-4 transition-transform duration-200 ${
          isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
        }`}
        onClick={(e) => {
          e.stopPropagation()
          toggleZoom(e)
        }}
      >
        <img
          src={currentImage?.url || currentImage}
          alt={t('common:lightbox.photoAlt', { index: currentIndex + 1 })}
          className={`max-h-[85vh] w-auto object-contain transition-transform duration-200 ${
            isZoomed ? 'scale-150' : 'scale-100'
          }`}
          draggable={false}
        />
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 max-w-[90vw] overflow-x-auto py-2 px-4">
          {images.map((image, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation()
                setCurrentIndex(idx)
                setIsZoomed(false)
              }}
              className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                idx === currentIndex
                  ? 'border-white ring-2 ring-white/30'
                  : 'border-transparent opacity-50 hover:opacity-100'
              }`}
            >
              <img
                src={image?.url || image}
                alt={t('common:lightbox.thumbnailAlt', { index: idx + 1 })}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

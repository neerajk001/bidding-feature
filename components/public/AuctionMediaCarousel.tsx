'use client'

import { useState, useMemo, useRef, useEffect } from 'react'

interface AuctionMediaCarouselProps {
    banner?: string | null
    gallery?: string[] | null
    reel?: string | null
    title: string
}

type Slide = {
    type: 'image' | 'video'
    src: string
    id: string
}

export default function AuctionMediaCarousel({ banner, gallery, reel, title }: AuctionMediaCarouselProps) {
    const [currentIndex, setCurrentIndex] = useState(0)
    const videoRef = useRef<HTMLVideoElement>(null)

    const slides = useMemo(() => {
        const items: Slide[] = []

        // 1. Banner Image (First)
        if (banner) {
            items.push({ type: 'image', src: banner, id: 'banner' })
        }

        // 2. Gallery Images
        if (gallery && gallery.length > 0) {
            gallery.forEach((img, idx) => {
                items.push({ type: 'image', src: img, id: `gallery-${idx}` })
            })
        }

        // 3. Reel Video (Last)
        if (reel) {
            items.push({ type: 'video', src: reel, id: 'reel' })
        }

        return items
    }, [banner, gallery, reel])

    const nextSlide = () => {
        setCurrentIndex((prev) => (prev + 1) % slides.length)
    }

    const prevSlide = () => {
        setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length)
    }

    // Effect to reset video when slide changes
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.pause()
            videoRef.current.currentTime = 0
            // Optionally try to auto-play if it's the current slide
            if (slides[currentIndex].type === 'video') {
                const playPromise = videoRef.current.play()
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        // Auto-play was prevented
                        console.log('Autoplay prevented', error)
                    })
                }
            }
        }
    }, [currentIndex, slides])

    if (slides.length === 0) {
        return (
            <div className="auction-detail-image" style={{ background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', color: '#888' }}>
                No media available
            </div>
        )
    }

    const currentSlide = slides[currentIndex]

    // Handler for video end
    const handleVideoEnded = () => {
        // "fully played and automatically slide"
        nextSlide()
    }

    return (
        <div className="media-carousel" style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)', background: '#000', marginBottom: '1rem', width: '100%' }}>
            <div className="carousel-slide" style={{ width: '100%', height: '100%', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>

                {currentSlide.type === 'image' ? (
                    <img
                        src={currentSlide.src}
                        alt={`${title} - view ${currentIndex + 1}`}
                        style={{ width: '100%', height: 'auto', maxHeight: '600px', objectFit: 'contain' }}
                    />
                ) : (
                    <video
                        ref={videoRef}
                        src={currentSlide.src}
                        controls
                        playsInline
                        muted
                        autoPlay
                        preload="metadata"
                        onEnded={handleVideoEnded}
                        style={{ width: '100%', height: 'auto', maxHeight: '600px', maxWidth: '100%' }}
                    />
                )}
            </div>

            {/* Navigation Buttons (only if > 1 slide) */}
            {slides.length > 1 && (
                <>
                    <button
                        type="button"
                        onClick={prevSlide}
                        aria-label="Previous slide"
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '10px',
                            transform: 'translateY(-50%)',
                            background: 'rgba(0, 0, 0, 0.65)',
                            color: '#ffffff',
                            border: '2px solid rgba(255,255,255,0.7)',
                            borderRadius: '50%',
                            width: '48px',
                            height: '48px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 99, /* High Z-Index */
                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                            transition: 'background 0.2s, transform 0.1s',
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)'
                            e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.65)'
                            e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
                        }}
                    >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>

                    <button
                        type="button"
                        onClick={nextSlide}
                        aria-label="Next slide"
                        style={{
                            position: 'absolute',
                            top: '50%',
                            right: '10px',
                            transform: 'translateY(-50%)',
                            background: 'rgba(0, 0, 0, 0.65)',
                            color: '#ffffff',
                            border: '2px solid rgba(255,255,255,0.7)',
                            borderRadius: '50%',
                            width: '48px',
                            height: '48px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 99, /* High Z-Index */
                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                            transition: 'background 0.2s, transform 0.1s',
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)'
                            e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.65)'
                            e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
                        }}
                    >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </button>

                    {/* Indicators */}
                    <div style={{
                        position: 'absolute',
                        bottom: '15px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: '8px',
                        zIndex: 99,
                        background: 'rgba(0,0,0,0.5)',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        backdropFilter: 'blur(4px)'
                    }}>
                        {slides.map((_, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => setCurrentIndex(idx)}
                                style={{
                                    width: '12px',
                                    height: '12px',
                                    borderRadius: '50%',
                                    border: '2px solid rgba(0,0,0,0.1)',
                                    background: idx === currentIndex ? '#ffffff' : 'rgba(255,255,255,0.4)',
                                    cursor: 'pointer',
                                    padding: 0,
                                    transition: 'background 0.2s, transform 0.1s'
                                }}
                                aria-label={`Go to slide ${idx + 1}`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

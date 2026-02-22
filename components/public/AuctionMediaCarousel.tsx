'use client'

import { useState, useMemo, useRef, useEffect } from 'react'

interface AuctionMediaCarouselProps {
    banner?: string | null
    gallery?: string[] | null
    reel?: string | null
    title: string
    /** When true, carousel fills its container (e.g. 16:9 on desktop) instead of using aspect-square; avoids stretched reel layout */
    fillParent?: boolean
}

type Slide = {
    type: 'image' | 'video'
    src: string
    id: string
}

export default function AuctionMediaCarousel({ banner, gallery, reel, title, fillParent }: AuctionMediaCarouselProps) {
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

    // Effect to handle video playback when slide changes
    useEffect(() => {
        const currentSlide = slides[currentIndex]

        if (videoRef.current) {
            // If current slide is a video, ensure it's ready to play from start
            if (currentSlide?.type === 'video') {
                videoRef.current.currentTime = 0
                const playPromise = videoRef.current.play()
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        // Auto-play was prevented
                        console.log('Autoplay prevented:', error)
                    })
                }
            } else {
                // If switching away from video, pause it
                videoRef.current.pause()
                videoRef.current.currentTime = 0
            }
        }
    }, [currentIndex, slides])

    if (slides.length === 0) {
        return (
            <div className="flex items-center justify-center h-[400px] bg-zinc-100 text-zinc-400">
                No media available
            </div>
        )
    }

    const currentSlide = slides[currentIndex]

    return (
        <div className={`relative w-full overflow-hidden rounded-xl bg-gray-100 mb-4 group ${fillParent ? 'h-full min-h-0' : 'aspect-[3/4] lg:aspect-square'}`}>
            <div className="w-full h-full flex items-center justify-center bg-zinc-100 min-h-0">
                {currentSlide.type === 'image' ? (
                    <img
                        key={currentSlide.id}
                        src={currentSlide.src}
                        alt={`${title} - view ${currentIndex + 1}`}
                        className={`w-full h-full object-contain ${fillParent ? 'max-h-full' : 'max-h-[600px]'}`}
                    />
                ) : (
                    <div className="relative w-full h-full flex items-center justify-center min-h-0">
                        <video
                            key={currentSlide.id}
                            ref={videoRef}
                            src={currentSlide.src}
                            controls
                            playsInline
                            preload="metadata"
                            className={`w-full h-full object-contain ${fillParent ? 'max-h-full' : 'max-h-[600px]'}`}
                            onEnded={() => {
                                console.log('Video ended, advancing slide')
                                nextSlide()
                            }}
                            onError={(e) => {
                                console.error('Video error:', e)
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Navigation Buttons (only if > 1 slide) */}
            {slides.length > 1 && (
                <>
                    <button
                        type="button"
                        onClick={prevSlide}
                        aria-label="Previous slide"
                        className="absolute top-1/2 left-4 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-black/70 hover:scale-110 transition-all z-10 opacity-0 group-hover:opacity-100 duration-300"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>

                    <button
                        type="button"
                        onClick={nextSlide}
                        aria-label="Next slide"
                        className="absolute top-1/2 right-4 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-black/70 hover:scale-110 transition-all z-10 opacity-0 group-hover:opacity-100 duration-300"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </button>

                    {/* Indicators */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 z-10 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
                        {slides.map((_, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => setCurrentIndex(idx)}
                                className={`w-2 h-2 rounded-full transition-all ${idx === currentIndex ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/60'
                                    }`}
                                aria-label={`Go to slide ${idx + 1}`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

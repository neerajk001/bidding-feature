'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { AuctionSummary } from './types'

interface HeroMediaProps {
    detail: AuctionSummary | null
    heroVariant: string
    heroArtLabel: string
    heroArtBadge: string
}

export default function HeroMedia({ detail, heroVariant, heroArtLabel, heroArtBadge }: HeroMediaProps) {
    // Combine banner_image and gallery_images
    const images = [
        detail?.banner_image,
        ...(detail?.gallery_images || [])
    ].filter(Boolean) as string[]

    // Ensure unique images if banner is in gallery
    const uniqueImages = Array.from(new Set(images))

    const hasReel = Boolean(detail?.reel_url)

    // Prepare items list
    const items = [
        ...uniqueImages.map((src) => ({ type: 'image' as const, src })),
        ...(hasReel && detail?.reel_url ? [{ type: 'video' as const, src: detail.reel_url }] : [])
    ]

    const totalItems = items.length
    const shouldScroll = totalItems > 1

    // State for slideshow
    const [currentIndex, setCurrentIndex] = useState(0)
    const timeoutRef = useRef<NodeJS.Timeout | null>(null)
    const videoRef = useRef<HTMLVideoElement>(null)

    const nextSlide = () => {
        setCurrentIndex((prev) => (prev + 1) % totalItems)
    }

    const prevSlide = () => {
        setCurrentIndex((prev) => (prev - 1 + totalItems) % totalItems)
    }

    useEffect(() => {
        if (!shouldScroll) return

        // Clear any existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }

        const currentItem = items[currentIndex]

        // If current item is a video, don't set auto-advance timer
        // The video's onEnded event will handle advancing
        if (currentItem?.type === 'video') {
            return
        }

        // For images, auto-advance after 3.5 seconds
        timeoutRef.current = setTimeout(nextSlide, 3500)

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
        }
    }, [currentIndex, shouldScroll, totalItems, items])

    // If no media, show placeholder
    if (totalItems === 0 && !detail?.banner_image) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-100 border border-gray-200 text-center gap-2 p-8">
                <span className="text-xl font-display font-medium text-gray-600">{heroArtLabel}</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-gray-200 text-gray-600">{heroArtBadge}</span>
            </div>
        )
    }

    if (!shouldScroll) {
        // Single Item Rendering
        if (items.length > 0) {
            const item = items[0]
            if (item.type === 'video') {
                return (
                    <div className="relative w-full h-full min-h-[400px]">
                        <video
                            src={item.src}
                            autoPlay
                            loop
                            muted
                            playsInline
                            controls
                            className="w-full h-full object-cover"
                        />
                    </div>
                )
            }
            return (
                <div className="relative w-full h-full min-h-[400px]">
                    <Image
                        src={item.src}
                        alt={detail?.title || 'Auction Item'}
                        fill
                        sizes="(max-width: 900px) 100vw, 50vw"
                        className="object-cover"
                        priority
                    />
                </div>
            )
        }
    }

    // Slideshow Rendering
    return (
        <div className="relative w-full h-full overflow-hidden group min-h-[400px]">
            <div
                className="flex h-full transition-transform duration-500 ease-out will-change-transform"
                style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
                {items.map((item, idx) => (
                    <div key={idx} className="relative min-w-full h-full flex-shrink-0">
                        {item.type === 'video' ? (
                            <video
                                ref={idx === currentIndex ? videoRef : null}
                                src={item.src}
                                autoPlay
                                muted
                                playsInline
                                controls
                                className="w-full h-full object-cover"
                                onEnded={nextSlide}
                            />
                        ) : (
                            <Image
                                src={item.src}
                                alt={`View ${idx + 1}`}
                                fill
                                sizes="(max-width: 900px) 100vw, 50vw"
                                className="object-cover"
                                priority={idx === 0}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Navigation Arrows */}
            {totalItems > 1 && (
                <>
                    <button
                        onClick={prevSlide}
                        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
                        aria-label="Previous slide"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <button
                        onClick={nextSlide}
                        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
                        aria-label="Next slide"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </>
            )}

            {/* Slide Indicators */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10 p-2 rounded-full bg-black/30 backdrop-blur-sm">
                {items.map((_, idx) => (
                    <button
                        key={idx}
                        className={`transition-all duration-300 rounded-full ${idx === currentIndex
                            ? 'bg-white w-6 h-1.5'
                            : 'bg-white/40 w-1.5 h-1.5 hover:bg-white/60'
                            }`}
                        onClick={() => setCurrentIndex(idx)}
                        aria-label={`Go to slide ${idx + 1}`}
                    />
                ))}
            </div>
        </div>
    )
}

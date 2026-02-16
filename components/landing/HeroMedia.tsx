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
            <div className="hero-card-art">
                <span className="hero-card-art-label">{heroArtLabel}</span>
                <span className="hero-card-art-badge">{heroArtBadge}</span>
            </div>
        )
    }

    if (!shouldScroll) {
        // Single Item Rendering
        if (items.length > 0) {
            const item = items[0]
            if (item.type === 'video') {
                return (
                    <div className="hero-media-single">
                        <video
                            src={item.src}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="media-item-video"
                        />
                    </div>
                )
            }
            return (
                <div className="hero-media-single">
                    <Image
                        src={item.src}
                        alt={detail?.title || 'Auction Item'}
                        fill
                        sizes="(max-width: 900px) 100vw, 50vw"
                        className="media-item-image"
                        priority
                    />
                </div>
            )
        }
    }

    // Slideshow Rendering
    return (
        <div className="hero-media-slider">
            <div
                className="hero-media-slider-track"
                style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
                {items.map((item, idx) => (
                    <div key={idx} className="hero-media-slide">
                        {item.type === 'video' ? (
                            <video
                                ref={idx === currentIndex ? videoRef : null}
                                src={item.src}
                                autoPlay
                                muted
                                playsInline
                                className="media-item-video"
                                onEnded={nextSlide}
                            />
                        ) : (
                            <Image
                                src={item.src}
                                alt={`View ${idx + 1}`}
                                fill
                                sizes="(max-width: 900px) 100vw, 50vw"
                                className="media-item-image"
                                priority={idx === 0}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Slide Indicators */}
            <div className="hero-media-indicators">
                {items.map((_, idx) => (
                    <button
                        key={idx}
                        className={`media-indicator ${idx === currentIndex ? 'active' : ''}`}
                        onClick={() => setCurrentIndex(idx)}
                        aria-label={`Go to slide ${idx + 1}`}
                    />
                ))}
            </div>
        </div>
    )
}

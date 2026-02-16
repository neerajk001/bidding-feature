import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const { data: auctions, error } = await supabaseAdmin
      .from('auctions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch auctions' },
        { status: 500 }
      )
    }

    return NextResponse.json({ auctions })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    const ALLOWED_REEL_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
    const MAX_REEL_MB = 50
    const bucket = process.env.SUPABASE_REEL_BUCKET || 'auction-media'

    let body: Record<string, any> = {}
    let reelFile: File | null = null
    let galleryUrls: string[] = []

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const getString = (key: string) => {
        const value = formData.get(key)
        return typeof value === 'string' ? value : ''
      }

      body = {
        title: getString('title'),
        product_id: getString('product_id'),
        min_increment: getString('min_increment'),
        base_price: getString('base_price'),
        banner_image: getString('banner_image'),
        registration_end_time: getString('registration_end_time'),
        bidding_start_time: getString('bidding_start_time'),
        bidding_end_time: getString('bidding_end_time'),
        status: getString('status'),
        reel_url: getString('reel_url'),
        available_sizes: getString('available_sizes')
      }

      const maybeReel = formData.get('reel')
      if (maybeReel && typeof maybeReel !== 'string') {
        reelFile = maybeReel
      }

      // Handle Gallery Images (Multiple)
      const galleryFiles = formData.getAll('gallery') as File[]

      if (galleryFiles && galleryFiles.length > 0) {
        for (const file of galleryFiles) {
          if (file instanceof File) {
            // Basic validation
            if (!file.type.startsWith('image/')) continue;
            if (file.size > 5 * 1024 * 1024) continue; // 5MB limit per image

            const ext = file.name.split('.').pop() || 'jpg'
            const path = `gallery/${crypto.randomUUID()}.${ext}`
            const buffer = Buffer.from(await file.arrayBuffer())

            const { error: uploadError } = await supabaseAdmin
              .storage
              .from(bucket)
              .upload(path, buffer, {
                contentType: file.type,
                upsert: false
              })

            if (!uploadError) {
              const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)
              galleryUrls.push(publicData.publicUrl)
            }
          }
        }
      }

      // Handle Gallery URLs (passed as strings from client-side upload)
      const passedGalleryUrls = formData.getAll('gallery_urls')
      if (passedGalleryUrls.length > 0) {
        passedGalleryUrls.forEach(url => {
          if (typeof url === 'string' && url.trim() !== '') {
            galleryUrls.push(url)
          }
        })
      }
    } else {
      body = await request.json()
      // Also check if gallery_urls are in JSON body
      if (body.gallery_urls && Array.isArray(body.gallery_urls)) {
        galleryUrls.push(...body.gallery_urls)
      }
    }

    // Validate required fields
    const {
      title,
      product_id,
      min_increment,
      base_price,
      banner_image,
      registration_end_time,
      bidding_start_time,
      bidding_end_time,
      status,
      reel_url,
      available_sizes
    } = body

    // ... validation logic ...

    // Parse available sizes
    const availableSizesArray = available_sizes
      ? String(available_sizes).split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : []

    if (!title || !product_id || !min_increment || !registration_end_time ||
      !bidding_start_time || !bidding_end_time || !status) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    // Validate status
    const validStatuses = ['draft', 'live', 'ended']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be draft, live, or ended' },
        { status: 400 }
      )
    }

    // Validate min_increment is a positive number
    const minIncrementValue = typeof min_increment === 'number'
      ? min_increment
      : parseFloat(min_increment)

    if (!Number.isFinite(minIncrementValue) || minIncrementValue <= 0) {
      return NextResponse.json(
        { error: 'Minimum increment must be a positive number' },
        { status: 400 }
      )
    }

    // Validate base_price if provided
    let basePriceValue: number | null = null
    if (base_price && base_price !== '') {
      basePriceValue = typeof base_price === 'number' ? base_price : parseFloat(base_price)

      if (!Number.isFinite(basePriceValue) || basePriceValue <= 0) {
        return NextResponse.json(
          { error: 'Base price must be a positive number' },
          { status: 400 }
        )
      }
    }

    // Convert datetime-local strings (treated as IST) to ISO format for Supabase
    // We append the IST offset (+05:30) so that the input time "22:00" is treated as "22:00 IST"
    // instead of "22:00 UTC". This ensures it displays as "22:00" for users in India.
    const toIST = (dateStr: string) => {
      // If it already has an offset or Z, leave it, otherwise assume IST
      if (dateStr.includes('Z') || dateStr.includes('+')) return new Date(dateStr)
      return new Date(`${dateStr}+05:30`)
    }

    const registrationEndUTC = toIST(registration_end_time).toISOString()
    const biddingStartUTC = toIST(bidding_start_time).toISOString()
    const biddingEndUTC = toIST(bidding_end_time).toISOString()

    // Validate time logic
    const regEnd = new Date(registrationEndUTC)
    const bidStart = new Date(biddingStartUTC)
    const bidEnd = new Date(biddingEndUTC)

    if (regEnd >= bidStart) {
      return NextResponse.json(
        { error: 'Registration must end before bidding starts' },
        { status: 400 }
      )
    }

    if (bidStart >= bidEnd) {
      return NextResponse.json(
        { error: 'Bidding start time must be before end time' },
        { status: 400 }
      )
    }

    let reelPublicUrl: string | null = reel_url || null

    if (reelFile) {
      if (!ALLOWED_REEL_TYPES.includes(reelFile.type)) {
        return NextResponse.json(
          { error: 'Reel must be MP4, WebM, or MOV' },
          { status: 400 }
        )
      }

      const maxBytes = MAX_REEL_MB * 1024 * 1024
      if (reelFile.size > maxBytes) {
        return NextResponse.json(
          { error: `Reel must be under ${MAX_REEL_MB}MB` },
          { status: 400 }
        )
      }

      const extension = reelFile.name.split('.').pop() || 'mp4'
      const reelPath = `reels/${crypto.randomUUID()}.${extension}`
      const buffer = Buffer.from(await reelFile.arrayBuffer())

      const { error: uploadError } = await supabaseAdmin
        .storage
        .from(bucket)
        .upload(reelPath, buffer, {
          contentType: reelFile.type,
          upsert: false
        })

      if (uploadError) {
        return NextResponse.json(
          { error: 'Failed to upload reel', details: uploadError.message },
          { status: 500 }
        )
      }

      const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(reelPath)
      reelPublicUrl = publicData.publicUrl
    }



    // Insert into Supabase using admin client
    const { data, error } = await supabaseAdmin
      .from('auctions')
      .insert({
        title,
        product_id,
        min_increment: minIncrementValue,
        base_price: basePriceValue,
        banner_image: banner_image || null,
        reel_url: reelPublicUrl,
        gallery_images: galleryUrls.length > 0 ? galleryUrls : [],
        registration_end_time: registrationEndUTC,
        bidding_start_time: biddingStartUTC,
        bidding_end_time: biddingEndUTC,
        status,
        available_sizes: availableSizesArray
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to create auction', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, auction: data },
      { status: 201 }
    )

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

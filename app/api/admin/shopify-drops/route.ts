import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET - Fetch all shopify drops (with optional filter for active only)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'

    let query = supabaseAdmin
      .from('shopify_drops')
      .select('*')
      .order('display_order', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: drops, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch shopify drops' },
        { status: 500 }
      )
    }

    return NextResponse.json({ drops: drops || [] })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new shopify drop
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, description, price, link_url, image_url, tone, display_order, is_active } = body

    if (!title || !description || !price || !link_url) {
      return NextResponse.json(
        { error: 'Missing required fields: title, description, price, link_url' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('shopify_drops')
      .insert({
        title,
        description,
        price,
        link_url,
        image_url: image_url || null,
        tone: tone || 'ochre',
        display_order: display_order || 0,
        is_active: is_active !== undefined ? is_active : true,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to create shopify drop' },
        { status: 500 }
      )
    }

    return NextResponse.json({ drop: data, message: 'Shopify drop created successfully' })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH - Update shopify drop
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Missing drop ID' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('shopify_drops')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to update shopify drop' },
        { status: 500 }
      )
    }

    return NextResponse.json({ drop: data, message: 'Shopify drop updated successfully' })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete shopify drop
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Missing drop ID' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('shopify_drops')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to delete shopify drop' },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: 'Shopify drop deleted successfully' })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

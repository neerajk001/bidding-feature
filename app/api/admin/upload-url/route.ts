import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getToken } from 'next-auth/jwt'
import { isAdminEmail } from '@/lib/auth/admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
        const email = token?.email as string | undefined

        if (!token || !isAdminEmail(email)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { filename, type, folder } = await request.json()

        if (!filename || !type) {
            return NextResponse.json({ error: 'Filename and type required' }, { status: 400 })
        }

        const bucket = process.env.SUPABASE_REEL_BUCKET || 'auction-media'
        const extension = filename.split('.').pop() || 'bin'
        const timestamp = Date.now()
        // Use folder if provided (e.g. 'reels' or 'gallery'), default to root or 'uploads'
        const cleanFolder = folder ? folder.replace(/[^a-z0-9]/gi, '') : 'uploads'
        const path = `${cleanFolder}/${timestamp}-${crypto.randomUUID()}.${extension}`

        const { data, error } = await supabaseAdmin
            .storage
            .from(bucket)
            .createSignedUploadUrl(path)

        if (error) {
            console.error('Info: Signed URL creation failed, trying standard upload path generation if bucket is public-write (unlikely) or just return error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // signedUrl is the URL to PUT to.
        // However, Supabase createSignedUploadUrl returns a URL that includes the token.
        // The client can just fetch(data.signedUrl, { method: 'PUT', body: file })

        // We also need the PUBLIC URL to save in the database.
        // If the bucket is public, we can just construct it.
        const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)

        return NextResponse.json({
            signedUrl: data.signedUrl,
            path: data.path,
            publicUrl: publicData.publicUrl
        })

    } catch (error) {
        console.error('Upload URL error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

import * as admin from 'firebase-admin'

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}'
    )

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
    
    console.log('✅ Firebase Admin initialized successfully')
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error)
    throw new Error('Failed to initialize Firebase Admin')
  }
}

export const firebaseAdmin = admin
export const auth = admin.auth()

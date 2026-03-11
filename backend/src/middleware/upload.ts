import { Request, Response, NextFunction } from 'express'
import multer from 'multer'

const upload = multer({ storage: multer.memoryStorage() })

export function maybeUpload(req: Request, res: Response, next: NextFunction) {
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    return upload.fields([
      { name: 'bannerImage', maxCount: 1 },
      { name: 'reelVideo', maxCount: 1 }
    ])(req, res, next)
  }
  return next()
}

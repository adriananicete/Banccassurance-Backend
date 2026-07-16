import multer from 'multer'
import path from 'path'

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'avatar_uploads/')
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const safeName = `${Date.now()}${ext}`
    cb(null, safeName)
  }
})

export const photoUpload = multer({
  storage: photoStorage,

  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files allowed'), false)
    }
    cb(null, true)
  },

  limits: {
    fileSize: 2 * 1024 * 1024 // ✅ 2MB
  }
})

export const consentUpload = multer({ dest: 'uploads/' })

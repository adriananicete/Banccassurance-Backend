import express from 'express'
import cors from 'cors'
import referralRoutes from './routes/referralRoutes.js'
import { connectDB } from './config/db.js'
import authRoutes from './routes/authRoutes.js'

import path from 'path'
import { fileURLToPath } from 'url'



const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


const app = express()
const PORT = 5000

// ✅ Middleware
app.use(cors())
app.use(express.json())

// ✅ Test route
app.get('/', (req, res) => {
  res.send('API is running...')
})

// ✅ API Routes
app.use('/api/referrals', referralRoutes)
app.use('/api/auth', authRoutes)

app.use(
  '/uploads',
  express.static(path.join(__dirname, '../avatar_uploads'))
)


// ✅ Connect to Database
connectDB()

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser' // 👈 Added: Needed to parse HTTP-Only Cookies
import referralRoutes from './routes/referralRoutes.js'
import { connectDB } from './config/db.js'
import authRoutes from './routes/authRoutes.js'

import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 5000


app.use(cors({
  origin: 'http://localhost:3000', // 👈 Restricts access strictly to your React application domain/port
  credentials: true                // 👈 CRUCIAL: Allows your browser and backend to share authorization cookies
}))

// ✅ Cookie Parser (⚠️ Must be placed BEFORE any API route declarations)
app.use(cookieParser())

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
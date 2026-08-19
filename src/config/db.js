// Pre-existing TLS/SNI compatibility workaround for this DB host — kept as-is.
process.env.NODE_NO_DEP_TLS_SNI = '1';
import sql from 'mssql'

const required = ['DB_USER', 'DB_PASSWORD', 'DB_SERVER', 'DB_DATABASE', 'JWT_SECRET', 'UNDERWRITING_API_KEY']

export const connectDB = async () => {
  const missing = required.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }

  const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: true
    }
  }

  try {
    await sql.connect(dbConfig)
    console.log('Connected to MSSQL')
  } catch (err) {
    console.error('DB connection failed:', err)
    throw err
  }
}

export default sql
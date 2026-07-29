// Pre-existing TLS/SNI compatibility workaround for this DB host — kept as-is.
process.env.NODE_NO_DEP_TLS_SNI = '1';
import sql from 'mssql'

const required = ['DB_USER', 'DB_PASSWORD', 'DB_SERVER', 'DB_DATABASE', 'JWT_SECRET', 'UNDERWRITING_API_KEY']
const missing = required.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`❌ Missing required DB env vars: ${missing.join(', ')}`)
  process.exit(1)
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

export const connectDB = async () => {
  try {
    await sql.connect(dbConfig)
    console.log('Connected to MSSQL')
  } catch (err) {
    throw err
  }
}

export default sql
process.env.NODE_NO_DEP_TLS_SNI = '1';
import sql from 'mssql'

const dbConfig = {
  user: 'devops',
  password: 'Pa$$w0rd',
  server: '192.5.5.142',
  database: 'BANCASSURANCE_UAT_DB',
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
    console.error('DB Connection Error:', err)
  }
}

export default sql
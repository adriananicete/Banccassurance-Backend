import bcrypt from 'bcrypt';

async function generate() {
    const saltRounds = 10;
    const myPassword = 'password123';
    const hash = await bcrypt.hash(myPassword, saltRounds);
    console.log('Use this hash in your database:', hash);
}

generate();
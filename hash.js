import bcrypt from 'bcrypt';

const password = '123456'; //test password

bcrypt.hash(password, 10).then(hash => {
    console.log('Hashed password:', hash);
});
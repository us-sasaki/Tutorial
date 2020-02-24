crypto = require("crypto");

plainText = 'abcdefghijklmnopqrstuvwxyz';
passowrd = 'WIdlbs9pDHoLnLo4xEnVKc1DKA0XUFS0';
alg = 'aes-256-cbc'
iv = '0000000000000000';
encoding = 'base64'  // 'binary' or 'hex'

cipher = crypto.createCipheriv(alg, passowrd, iv);
cipheredText = cipher.update(plainText, 'utf8', encoding);
cipheredText += cipher.final(encoding);

decipher = crypto.createDecipheriv(alg, passowrd, iv);
dec = decipher.update(cipheredText, encoding, 'utf8');
dec += decipher.final('utf8');

console.log('crypted: '+ cipheredText);
console.log('decrypted: ' + dec);

const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

//create table if not already
router.get('/createuserstable', (req, res) => {
  let sql =
    'CREATE TABLE users(id int AUTO_INCREMENT, email VARCHAR(255), passwordHash VARCHAR(255), secret VARCHAR(255), PRIMARY KEY (id))';
  db.query(sql, (err, result) => {
    if (err) {
      console.log(err);
      res.send('Table already created');
    } else {
      console.log(result);
      res.send('Users table created');
    }
  });
});

// register user
router.post('/register', (req, res) => {
  const newUserData = {
    email: req.body.email,
    passwordHash: bcrypt.hashSync(req.body.password, 10),
  };

  // check if email already registered
  const findQuery = `SELECT * FROM users WHERE email = "${req.body.email}"`;
  db.query(findQuery, (error, result) => {
    if (error) {
      return res.json({ message: error });
    }
    if (result.length > 0) {
      return res.status(400).send('User already exists');
    }

    //if no email found, register new user
    const createNewUser = 'INSERT INTO users set ?';
    db.query(createNewUser, newUserData, (error, result) => {
      if (error) {
        console.log(error);
      } else {
        // Generate random code
        const characters = '0123456789';
        // const characters ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

        function generateSecret(length) {
          let result = '';
          const charactersLength = characters.length;
          for (let i = 0; i < length; i++) {
            result += characters.charAt(
              Math.floor(Math.random() * charactersLength)
            );
          }

          return result;
        }

        const authCode = generateSecret(5);

        db.query(
          `UPDATE users SET secret = '${authCode}'WHERE email = "${req.body.email}"`
        );

        // We need to send authCode here
      }
    });
  });
});

//login
router.post('/login', (req, res) => {
  const currentUser = `SELECT * FROM users WHERE email = "${req.body.email}"`;

  // Generate random code
  const characters = '0123456789';
  // const characters ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  function generateSecret(length) {
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
  }

  const findUser = db.query(currentUser, (error, result) => {
    if (error) {
      return res.send('No user found for this email address!');
    }
    if (result.length > 0) {
      if (bcrypt.compareSync(req.body.password, result[0].passwordHash)) {
        const authCode = generateSecret(5);

        db.query(
          `UPDATE users SET secret = '${authCode}'WHERE email = "${req.body.email}"`
        );

        // We need to send authCode here
      } else {
        res.status(400).send('Password is wrong');
      }
    } else {
      return res.status(400).send('User not found');
    }
  });
});

// validate secret
router.post('/secret', (req, res) => {
  const currentUser = `SELECT * FROM users WHERE email = "${req.body.email}"`;

  const findUser = db.query(currentUser, (error, result) => {
    if (error) {
      return res.send('No user found for this email address!');
    }
    if (result.length > 0) {
      if (req.body.userSecret === result[0].secret) {
        const token = jwt.sign(
          {
            id: result[0].id,
            email: result[0].email,
          },
          process.env.SECRET,
          {
            expiresIn: '1d', //one day is "1d" /"1w"...
          }
        );

        res
          .cookie('token', token, {
            httpOnly: true,
            sameSite:
              process.env.NODE_ENV === 'development'
                ? 'lax'
                : process.env.NODE_ENV === 'production' && 'none',
            secure:
              process.env.NODE_ENV === 'development'
                ? false
                : process.env.NODE_ENV === 'production' && true,
          })
          .status(200)
          .send({
            id: result[0].id,
            email: result[0].email,
            token: token,
          });
      } else {
        res.status(400).send('Secret is wrong');
      }
    } else {
      return res.status(400).send('User not found');
    }
  });
});

//get user details
router.get('/find/:id', (req, res) => {
  const sql = `SELECT * FROM users WHERE id = ${req.params.id}`;
  db.query(sql, (error, result) => {
    if (error) {
      return res.json({ message: error });
    } else {
      res.send(result);
    }
  });
});

// update user email
router.put('/update/email/:id', (req, res) => {
  const newData = {
    email: req.body.email,
  };

  const sql = `UPDATE users SET email = '${newData.email}' WHERE id = ${req.params.id}`;
  db.query(sql, (error, result) => {
    if (error) {
      return res.json({ message: error });
    } else {
      return res.json({ message: result });
    }
  });
});

// update user password
router.put('/update/password/:id', (req, res) => {
  const newData = {
    email: req.body.email,
    password: req.body.password,
    passwordHash: bcrypt.hashSync(req.body.newPassword, 10),
  };

  // check user and current password
  const findQuery = `SELECT * FROM users WHERE email = "${newData.email}"`;

  const findUser = db.query(findQuery, (err, result) => {
    if (err) {
      return res.send('No user found for this email address!');
    }

    // if user
    if (result.length > 0) {
      // if old password is correct
      if (bcrypt.compareSync(req.body.password, result[0].passwordHash)) {
        // update password
        const sql = `UPDATE users SET passwordHash = '${newData.passwordHash}' WHERE id = ${req.params.id}`;
        db.query(sql, (err, result) => {
          if (err) {
            return res.json({ message: err });
          } else {
            return res.json({ message: result });
          }
        });
      } else {
        res.status(400).send('Old password is wrong');
      }
    } else {
      return res.status(400).send('User not found');
    }
  });
});

//check if the user is loged in
router.get('/loggedIn', (req, res) => {
  try {
    const token = req.cookies.token;

    if (!token) return res.json(null);

    const validatedUser = jwt.verify(token, process.env.SECRET);
    res.send(validatedUser);
  } catch (err) {
    return res.json(null);
  }
});

//log out
router.post('/logout', (req, res) => {
  try {
    res
      .cookie('token', '', {
        httpOnly: true,
        sameSite:
          process.env.NODE_ENV === 'development'
            ? 'lax'
            : process.env.NODE_ENV === 'production' && 'none',
        secure:
          process.env.NODE_ENV === 'development'
            ? false
            : process.env.NODE_ENV === 'production' && true,
        expires: new Date(0),
      })
      .send('Logged out!');
  } catch (err) {
    return res.send(err);
  }
});

module.exports = router;

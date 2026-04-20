import 'dotenv/config';
import createError from 'http-errors';
import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import cors from 'cors';

import usersRouter from './routes/intern.js';

const app = express();
const port = process.env.PORT || 3010;

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(cors({ origin: 'https://web3nova.com', }))


app.get('/', (req, res) => {
  res.send('intership server is live');
});


// protected route
app.use('/', usersRouter);



// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError(404));
});

// error handler
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({
      error: err.message,
      ...(req.app.get('env') === 'development' && { stack: err.stack }),
    });
  });


// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});


export default app;

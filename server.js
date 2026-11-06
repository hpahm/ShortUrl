const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./config/db');
const Url = require('./models/Url');
const routes = require('./routes/url');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use(routes);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Error' : 'Invalid Request ' });
});

if (require.main === module) {
  const server = app.listen(config.port, () => {
    console.log(`Server is running at ${config.baseUrl}`);
  });

  const shutdown = () => {
    server.close();
    Url.flushClicks();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;

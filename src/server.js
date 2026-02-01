const app = require('./app');
const db = require('./database'); // init db

const PORT = process.env.PORT || 4005;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});

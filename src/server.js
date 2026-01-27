const app = require('./app');
const db = require('./database'); // init db

const PORT = 4005;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

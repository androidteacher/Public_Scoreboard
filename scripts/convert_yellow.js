const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '../Yellow_List.csv');
const outPath = path.join(__dirname, '../src/yellow_flags.json');

try {
    const data = fs.readFileSync(csvPath, 'utf8');
    const lines = data.split('\n').filter(line => line.trim() !== '');

    const flags = lines.map(line => {
        // Simple CSV parse: split by comma, assuming no commas in values based on file view
        const parts = line.split(',');
        if (parts.length < 3) return null;

        return {
            name: parts[1].trim(),
            value: parts[2].trim(),
            points: 200,
            category: 'Yellow'
        };
    }).filter(f => f !== null);

    console.log(`Found ${flags.length} flags.`);
    fs.writeFileSync(outPath, JSON.stringify(flags, null, 2));
    console.log(`Wrote to ${outPath}`);

} catch (e) {
    console.error(e);
}

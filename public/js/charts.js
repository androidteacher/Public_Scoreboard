
// Chart.js implementation for Scoreboard
document.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('scoresChart').getContext('2d');

    let chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day'
                    },
                    grid: { color: '#30363d' },
                    ticks: { color: '#8b949e' }
                },
                y: {
                    grid: { color: '#30363d' },
                    ticks: { color: '#8b949e' }
                }
            },
            plugins: {
                legend: { labels: { color: '#c9d1d9' } }
            }
        }
    });

    // Fetch stats
    fetch('/api/stats')
        .then(res => res.json())
        .then(data => {
            // Data is {username, timestamp, points_awarded} ordered by timestamp
            // We need to aggregate running totals per user

            const users = {};

            data.forEach(row => {
                if (!users[row.username]) {
                    users[row.username] = {
                        label: row.username,
                        data: [],
                        currentScore: 0,
                        borderColor: getRandomColor(),
                        tension: 0.1
                    };
                }

                users[row.username].currentScore += row.points_awarded;
                users[row.username].data.push({
                    x: row.timestamp,
                    y: users[row.username].currentScore
                });
            });

            // Convert object to array
            const datasets = Object.values(users);

            // Limit to top 10 active players to avoid clutter? Or show all?
            // Let's show all for now, or maybe filtering is needed for large datasets.

            chart.data.datasets = datasets;
            chart.update();
        });

    function getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }
});

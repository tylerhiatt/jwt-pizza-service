const { startMetricsCollection } = require("./metrics.js");
const app = require("./service.js");

const port = process.argv[2] || 3000;

startMetricsCollection(); // start collecting metrics when server starts

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});

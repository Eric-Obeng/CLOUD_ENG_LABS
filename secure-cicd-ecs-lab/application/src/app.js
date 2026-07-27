const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;
const FULL_NAME = "Eric Obeng";
const LAB_NAME = "Secure CI/CD ECS Lab";

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>${LAB_NAME}</title>
        <style>
          body {
            font-family: -apple-system, Arial, sans-serif;
            background: #0f172a;
            color: #f1f5f9;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          h1 { font-size: 2rem; margin-bottom: 0.25rem; }
          p { color: #94a3b8; }
        </style>
      </head>
      <body>
        <h1>${FULL_NAME}</h1>
        <p>${LAB_NAME}</p>
      </body>
    </html>
  `);
});

// Simple health endpoint - ALB target group can point here or at "/",
// either works since both return 200.
app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});

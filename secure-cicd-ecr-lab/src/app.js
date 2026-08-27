const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (request, response) => {
  response.status(200).json({
    message: "Secure CI/CD Pipeline Lab",
    Status: "running",
  });
});

app.get("/health", (request, response) => {
  response.status(200).json({
    status: "healthy",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Application running on port ${PORT}`);
});

// triger action
import dotenv from "dotenv";

// use .env by dwfault and ovveride with .test.env file
dotenv.config({ path: ".env", quiet: true });
dotenv.config({ path: ".test.env", quiet: true });

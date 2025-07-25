// src/server/index.ts
import express from "express"
import { createExpressMiddleware } from "@trpc/server/adapters/express"
import { appRouter } from "./trpc.js"

const app = express()
app.use("/trpc", createExpressMiddleware({ router: appRouter }))
app.listen(2022, () => console.log("tRPC ready on http://localhost:2022/trpc"))

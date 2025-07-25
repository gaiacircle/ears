import { createExpressMiddleware } from "@trpc/server/adapters/express"
import express from "express"

// Important: import before other local code
import "./environ"

import { appRouter } from "./trpc.js"

const app = express()

// Log requests
app.use((req, res, next) => {
  console.log(req.method, req.path)
  next()
})

app.use("/trpc", createExpressMiddleware({ router: appRouter }))

app.listen(2022, () => console.log("tRPC ready on http://localhost:2022/trpc"))

import * as dotenv from "dotenv"
import path from "node:path"

const projectPath = path.resolve(
  path.join(import.meta.dirname, "..", "..", ".."),
  ".env",
)

dotenv.config({
  path: projectPath,
  quiet: true,
})

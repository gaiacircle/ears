import { initTRPC } from "@trpc/server"
import { generateObject } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import Replicate from "replicate" // for image gen
import { z } from "zod"
import { uuidv7 as uuid } from "uuidv7"
import unindent from "@nrsk/unindent"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  extraBody: {
    provider: {
      only: ["novita"],
    },
  },
})

const replicate = new Replicate()

const t = initTRPC.create()

const OpportunityBaseSchema = z.object({
  type: z.enum(["question", "search", "generative"]),
  trigger: z.string(),
  content: z.string(),
})

const OpportunityInferenceSchema = z.object({
  opportunities: z.array(OpportunityBaseSchema),
})

export const appRouter = t.router({
  chat: t.procedure
    .input(
      z.object({
        recentMessages: z.string().array().min(1),
        recentOpportunities: z.string().array(),
      }),
    )
    .mutation(async ({ input: { recentMessages, recentOpportunities } }) => {
      const mostRecentMessage = recentMessages[recentMessages.length - 1]

      const messages = [
        {
          role: "system" as const,
          content: unindent(`
            Analyze the transcript for opportunities to help. For each new user message, classify as:
            1. QUESTION/UNKNOWN - static, widely-known, or derivable → answer from memory.
              (includes classics like “Do you know…?” “What was the name…?”)
            2. SEARCH RETRIEVAL - time-sensitive, live, or domain-specific → external lookup required.
              (includes “I read somewhere…,” “current price,” “next flight”)
            3. GENERATIVE MOMENT - visual, imaginative, hypothetical.

            Tag only the exact category, supply concise help, explain what triggered it, ≤12 words, skip repeats, else [].

            Previous help already presented to user:
            ${recentOpportunities.join("\n\n")}
					`),
        },
        ...recentMessages.map((m) => ({
          role: "user" as const,
          content: m,
        })),
      ]

      console.log("chat", {
        recentMessages,
        recentOpportunities,
      })

      const { object } = await generateObject<
        z.infer<typeof OpportunityInferenceSchema>
      >({
        // model: togetherai("moonshotai/Kimi-K2-Instruct"),
        // model: togetherai("Qwen/Qwen3-235B-A22B-Instruct-2507-tput"),
        // model: openrouter("moonshotai/kimi-k2"),
        model: openrouter("qwen/qwen3-235b-a22b-2507"),
        schema: OpportunityInferenceSchema,
        messages,
      })

      console.log("-> Opportunities:", object.opportunities)

      const imageEnhancedOpps: ((typeof object.opportunities)[number] & {
        imageUrl?: string
      })[] = []
      for (const opp of object.opportunities) {
        if (opp.type === "generative") {
          console.log("-> Enhancing generative opportunity with an image...")

          const output = (await replicate.run(
            "black-forest-labs/flux-schnell",
            {
              input: { prompt: `${mostRecentMessage}\n\n${opp.content}` },
            },
          )) as { url: () => { href: string } }[]

          const firstResponse = output[0]

          if (typeof firstResponse.url === "function") {
            const imageUrl = firstResponse.url().href
            console.log("-> image", imageUrl)
            imageEnhancedOpps.push({ ...opp, imageUrl })
            continue
          }
        }
        imageEnhancedOpps.push(opp)
      }
      console.log("-> Return", imageEnhancedOpps.length)

      return {
        opportunities: imageEnhancedOpps.map((o) => ({
          ...o,
          id: uuid(),
          timestamp: Date.now(),
        })),
      }
    }),
})

export type AppRouter = typeof appRouter

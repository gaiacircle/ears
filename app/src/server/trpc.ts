import { initTRPC } from "@trpc/server"
import { generateObject } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider" // for llm
import Replicate from "replicate" // for image gen
import { tavily as createTavily } from "@tavily/core" // for search
import { z } from "zod"
import { uuidv7 as uuid } from "uuidv7"
import unindent from "@nrsk/unindent"

import type { Opportunity } from "./opportunity.js"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  extraBody: {
    provider: {
      only: ["novita"],
    },
  },
})

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

const tavily = createTavily({
  apiKey: process.env.TAVILY_API_KEY,
})

const t = initTRPC.create()

const QuestionOppSeedSchema = z.object({
  type: z.literal("question"),
  trigger: z.string(),
  answer: z.string(),
})

const SearchOppSeedSchema = z.object({
  type: z.literal("search"),
  trigger: z.string(),
  searchQuery: z.string(),
})

const GenerativeOppSeedSchema = z.object({
  type: z.literal("generative"),
  trigger: z.string(),
  imagePrompt: z.string(),
})

const OpportunitySeedSchema = z.union([
  QuestionOppSeedSchema,
  SearchOppSeedSchema,
  GenerativeOppSeedSchema,
])

const OpportunityCategorizationSchema = z.object({
  opportunities: OpportunitySeedSchema.array(),
})

async function inferOpportunitySeeds(
  recentMessages: string[],
  recentOpportunities: string[],
) {
  const messages = [
    {
      role: "system" as const,
      content: unindent(`
            Analyze the transcript for opportunities to help. For each new user message, classify as:
            1. QUESTION/UNKNOWN
              - static, widely-known, or derivable → answer from memory.
              - examples: "Do you know…?" "What was the name…?"
              - NOTE: content MUST be ≤12 words.
            2. SEARCH RETRIEVAL
              - time-sensitive, live, or domain-specific → external lookup required.
              - examples: "I read somewhere…," "current price," "next flight", "next flight", "I heard on the news…"
              - NOTE: content MUST be a search engine query.
            3. GENERATIVE MOMENT
              - visual, imaginative, hypothetical.
              - examples: "Imagine…" "Picture a graph…" "Remember those (nostaligic items)…"
              - NOTE: content MUST be a simple image prompt.

            Tag only the exact category, supply concise help, explain what triggered it, skip repeats, else [].

            Previous help already presented to user:
            ${recentOpportunities.join("\n\n")}
					`),
    },
    ...recentMessages.map((m) => ({
      role: "user" as const,
      content: m,
    })),
  ]

  const { object } = await generateObject<
    z.infer<typeof OpportunityCategorizationSchema>
  >({
    model: openrouter("qwen/qwen3-235b-a22b-2507"),
    schema: OpportunityCategorizationSchema,
    messages,
  })

  return object.opportunities
}

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

      console.log("chat", {
        recentMessages,
        recentOpportunities,
      })

      const oppSeeds = await inferOpportunitySeeds(
        recentMessages,
        recentOpportunities,
      )

      console.log("-> Opportunity seeds:", oppSeeds)

      const opportunities: Opportunity[] = []

      const id = uuid()
      const timestamp = Date.now()

      for (const seed of oppSeeds) {
        switch (seed.type) {
          case "question": {
            opportunities.push({
              type: "question",
              id,
              timestamp,
              trigger: seed.trigger,
              answer: seed.answer,
            })
            console.log(" -> question:", seed.answer)
            break
          }

          case "search": {
            console.log(" -> search (request):", seed.searchQuery)
            const output = await tavily.search(seed.searchQuery, {
              maxResults: 3,
              includeAnswer: true,
              includeImages: true,
              includeImageDescriptions: true,
              includeRawContent: "markdown",
            })
            if (!output.answer) {
              console.warn(
                " -> search query has no answer, discarding",
                seed.searchQuery,
              )
              break
            }
            opportunities.push({
              type: "search",
              id,
              timestamp,
              trigger: seed.trigger,
              searchQuery: seed.searchQuery,
              answer: output.answer,
              images: output.images.map((i) => ({
                url: i.url,
                // biome-ignore lint/style/noNonNullAssertion: <explanation>
                description: i.description!,
              })),
              results: output.results.map((r) => ({
                url: r.url,
                title: r.title,
                content: r.content,
              })),
            })
            console.log(
              " -> search (response):",
              seed.searchQuery,
              output.answer,
            )
            break
          }

          case "generative":
            {
              console.log(" -> generative (request):", seed.imagePrompt)
              const output = (await replicate.run(
                "black-forest-labs/flux-schnell",
                {
                  input: {
                    prompt: `${mostRecentMessage}\n\n${seed.imagePrompt}`,
                  },
                },
              )) as { url: () => { href: string } }[]

              const firstResponse = output[0]

              if (typeof firstResponse.url === "function") {
                const imageUrl = firstResponse.url().href
                opportunities.push({
                  type: "generative",
                  id,
                  timestamp,
                  trigger: seed.trigger,
                  imagePrompt: seed.imagePrompt,
                  imageUrl,
                })
                console.log(
                  " -> generative (response):",
                  seed.imagePrompt,
                  imageUrl,
                )
                continue
              }
            }
            break
        }
      }
      console.log("-> opportunities", opportunities.length)

      return { opportunities }
    }),
})

export type AppRouter = typeof appRouter

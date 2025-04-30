// Load environment variables
require("dotenv").config();

const { google } = require("@ai-sdk/google");
const { generateText, generateObject } = require("ai");
const { z } = require("zod");
const fs = require("fs").promises;
const path = require("path");
const { existsSync } = require("fs");
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const ffmpeg = require("fluent-ffmpeg");
const util = require("util");

function getDurationFromBuffer(buffer) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(buffer, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(metadata.format.duration);
    });
  });
}

// Stage 1: Script + Outline Planner (Markdown output)
async function generatePresentation(articleText) {
  const stageOnePrompt = `
ROLE
You are a veteran presentation writer-narrator.

SOURCE ARTICLE
${articleText}

GOAL
Transform the article into a complete presentation plan that preserves every key idea while making it easy to follow when spoken aloud.

DELIVERABLE
Return **only** the following Markdown structure—no extra prose, no code fences:

# Slide 1: <Concise Title>
**Key Points**
- bullet 1 (≤ 12 words)
- …
**Narration**
> Full narration for this slide (≈120–160 words)

# Slide 2: <Title>
**Key Points**
- …
**Narration**
> …

…continue until the content of the article is fully covered.

RULES
1. The number of slides should be the minimum needed to include *all* significant concepts without rushing (typ. 8–15 for a medium-length article).  
2. Narration must track the article's logic paragraph-by-paragraph; do **not** omit or invent material.  
3. Bullet points echo the narration but stay slide-friendly (no sentence-long bullets).  
4. Keep titles ≤ 8 words, Title Case.  
5. Do not wrap the output in back-ticks or other fences.  Return the raw Markdown exactly as shown above.
`;

  const { text: markdownWithNarration } = await generateText({
    model: google("gemini-2.5-pro-preview-03-25"),
    prompt: stageOnePrompt,
  });

  return markdownWithNarration;
}

// Stage 2: Slide Markdown Generator (Markdown output)
async function generateSlides(markdownFromStageOne) {
  const stageTwoPrompt = `
ROLE
You are a meticulous slide formatter.

INPUT
${markdownFromStageOne}

TASK
Generate final reveal.js-style slides, omitting the narration and keeping only visual content.

TRANSFORM RULES
1. For each "Slide N" block:
   • Retain the title as an H1 (\`#\`).  
   • Retain the **Key Points** list exactly as written (bullets only).  
   • Discard the **Narration** section entirely.  
2. Separate slides with a line containing only three hyphens:  
   ---
3. Do not add or reorder content.

OUTPUT
Return pure Markdown containing all slides, in order, separated by \`---\`.
`;

  const { text: slidesMarkdown } = await generateText({
    model: google("gemini-2.5-pro-preview-03-25"),
    prompt: stageTwoPrompt,
  });

  return slidesMarkdown;
}

// Stage 3: Slide ↔ Narration Synchronizer (JSON output)
async function synchronizeSlidesAndNarration(slidesMarkdown, originalMarkdown) {
  const synchronizationSchema = z.array(
    z.object({
      slide_number: z.number(),
      slide_content: z.string(),
      narration_text: z.string(),
    })
  );

  const stageThreePrompt = `
ROLE
You align slide content with its narration.

INPUTS
SLIDES_MARKDOWN:
${slidesMarkdown}

ORIGINAL_MARKDOWN_WITH_NARRATION:
${originalMarkdown}

OBJECTIVE
Produce a JSON array where each element links one slide to its narration text.

STRICT SCHEMA
[
  {
    "slide_number": 1,
    "slide_content": "exact markdown for slide 1, no narration",
    "narration_text": "exact narration text for slide 1"
  },
  …
]

CONSTRAINTS
- \`slide_content\` must match the corresponding block from SLIDES_MARKDOWN **verbatim** (no leading/trailing blanks).  
- \`narration_text\` must match the narration for the same slide from ORIGINAL_MARKDOWN_WITH_NARRATION **verbatim**.  
- Number slides consecutively starting at 1; object count must equal the number of slides.  
- Output **only** the JSON array.
`;

  const result = await generateObject({
    model: google("gemini-2.5-flash-preview-04-17"),
    schema: synchronizationSchema,
    prompt: stageThreePrompt,
  });

  return result.object;
}

/**
 * Group array items into batches
 * @param {Array} array - Array to batch
 * @param {number} batchSize - Size of each batch
 * @returns {Array<Array>} - Array of batches
 */
function batchArray(array, batchSize) {
  const batches = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Generates MP3 narrations for slides and returns enhanced content with batched requests
 * @param {Array} synchronizedContent - The slides and narration content
 * @param {Object} options - Configuration options
 * @param {number} options.batchSize - Number of TTS requests to process in parallel (default: 5)
 * @param {string} options.outputDir - Directory to save MP3 files (default: "narrations")
 * @param {string} options.voiceLanguage - Language code for TTS (default: "en-US")
 * @param {string} options.voiceName - Name for TTS (default: "en-US-Chirp3-HD-Puck")
 * @returns {Promise<Array>} - Enhanced content with MP3 paths and durations
 */
async function generateNarrations(synchronizedContent, options = {}) {
  const client = new TextToSpeechClient();

  const {
    batchSize = 1,
    outputDir = ".output/narrations",
    voiceLanguage = "en-US",
    voiceName = "en-US-Chirp3-HD-Puck",
  } = options;

  console.log(
    `Starting narration generation for ${synchronizedContent.length} slides`
  );
  console.log(
    `Options: batchSize=${batchSize}, outputDir=${outputDir}, voice=${voiceName}`
  );

  // Create output directory if it doesn't exist
  const outputPath = path.join(process.cwd(), outputDir);
  if (!existsSync(outputPath)) {
    console.log(`Creating output directory: ${outputPath}`);
    await fs.mkdir(outputPath, { recursive: true });
  } else {
    console.log(`Using existing output directory: ${outputPath}`);
  }

  // Split the content into batches for processing
  const contentBatches = batchArray(synchronizedContent, batchSize);
  console.log(
    `Split content into ${contentBatches.length} batches of size ${batchSize}`
  );

  let enhancedContent = [];
  let successCount = 0;
  let errorCount = 0;

  // Process each batch
  for (const [batchIndex, batch] of contentBatches.entries()) {
    console.log(
      `Processing batch ${batchIndex + 1}/${contentBatches.length} (${
        batch.length
      } slides)...`
    );

    // Process each item in the batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (slide) => {
        try {
          const slideNumber = slide.slide_number;
          const narrationText = slide.narration_text;
          console.log(
            `[Slide ${slideNumber}] Processing narration (${narrationText.length} chars)`
          );

          const fileName = `slide_${slideNumber}_narration.mp3`;
          const filePath = path.join(outputPath, fileName);

          // Construct the TTS request
          const request = {
            input: { text: narrationText },
            voice: { languageCode: voiceLanguage, name: voiceName },
            audioConfig: { audioEncoding: "LINEAR16" },
          };

          console.log(`[Slide ${slideNumber}] Calling Google TTS API...`);
          const startTime = Date.now();
          // Generate speech
          const [response] = await client.synthesizeSpeech(request);
          const apiTime = Date.now() - startTime;
          console.log(
            `[Slide ${slideNumber}] TTS API call completed in ${apiTime}ms`
          );

          // Save MP3 file
          console.log(`[Slide ${slideNumber}] Saving audio to ${filePath}`);
          await fs.writeFile(filePath, response.audioContent, "binary");

          // Get exact duration using ffmpeg
          console.log(`[Slide ${slideNumber}] Calculating audio duration...`);
          const durationInSeconds = await getDurationFromBuffer(filePath);
          console.log(
            `[Slide ${slideNumber}] Audio duration: ${durationInSeconds.toFixed(
              2
            )}s`
          );

          successCount++;

          // Return enhanced slide object
          return {
            ...slide,
            narration_mp3_path: filePath,
            narration_duration_seconds: parseFloat(
              durationInSeconds.toFixed(2)
            ),
          };
        } catch (error) {
          errorCount++;
          console.error(
            `[Slide ${slide.slide_number}] ERROR: ${error.message}`
          );
          console.error(
            `[Slide ${slide.slide_number}] Stack trace: ${error.stack}`
          );

          // Return original slide with error information if there's a failure
          return {
            ...slide,
            narration_mp3_path: null,
            narration_duration_seconds: 0,
            error: error.message,
          };
        }
      })
    );

    // Add processed batch to the results
    enhancedContent = [...enhancedContent, ...batchResults];
    console.log(
      `Batch ${batchIndex + 1} complete. Progress: ${enhancedContent.length}/${
        synchronizedContent.length
      } slides processed`
    );
  }

  console.log(
    `Narration generation complete. Success: ${successCount}, Errors: ${errorCount}`
  );
  return enhancedContent;
}

// Main function to run the entire process
async function run(articleText) {
  try {
    // Create .debug directory if it doesn't exist
    const debugDir = path.join(process.cwd(), ".debug");
    if (!existsSync(debugDir)) {
      await fs.mkdir(debugDir, { recursive: true });
      console.log(`Created debug directory: ${debugDir}`);
    }

    console.log("Stage 1: Generating presentation outline with narration...");
    const markdownWithNarration = await generatePresentation(articleText);
    // Write stage 1 output to debug file
    await fs.writeFile(
      path.join(debugDir, "stage1_outline_with_narration.md"),
      markdownWithNarration,
      "utf-8"
    );
    console.log("Stage 1 complete. Debug output saved.");

    console.log("Stage 2: Generating presentation slides...");
    const slidesMarkdown = await generateSlides(markdownWithNarration);
    // Write stage 2 output to debug file
    await fs.writeFile(
      path.join(debugDir, "stage2_slides_markdown.md"),
      slidesMarkdown,
      "utf-8"
    );
    console.log("Stage 2 complete. Debug output saved.");

    console.log("Stage 3: Synchronizing slides with narration...");
    const synchronizedContent = await synchronizeSlidesAndNarration(
      slidesMarkdown,
      markdownWithNarration
    );
    // Write stage 3 output to debug file
    await fs.writeFile(
      path.join(debugDir, "stage3_synchronized_content.json"),
      JSON.stringify(synchronizedContent, null, 2),
      "utf-8"
    );
    console.log("Stage 3 complete. Debug output saved.");

    console.log("Stage 4: Generating narrations...");
    const enhancedContent = await generateNarrations(synchronizedContent);
    // Write stage 4 output to debug file
    await fs.writeFile(
      path.join(debugDir, "stage4_enhanced_content.json"),
      JSON.stringify(enhancedContent, null, 2),
      "utf-8"
    );
    console.log("Stage 4 complete. Debug output saved.");

    // Save the final result as JSON
    const outputFile = path.join(process.cwd(), "presentation_data.json");
    await fs.writeFile(
      outputFile,
      JSON.stringify(enhancedContent, null, 2),
      "utf-8"
    );
    console.log(`Final presentation data saved to ${outputFile}`);

    return enhancedContent;
  } catch (error) {
    console.error("Error in the presentation generation process:", error);
    throw error;
  }
}

module.exports = {
  generatePresentation,
  generateSlides,
  synchronizeSlidesAndNarration,
  generateNarrations,
  run,
};

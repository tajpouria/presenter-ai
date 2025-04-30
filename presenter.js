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
const { execSync } = require("child_process");

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
You are an expert presentation developer and storytelling specialist. Your task is to transform the provided content into a compelling presentation script with corresponding slide suggestions.

## Your Task:

1. **Analyze the input content thoroughly**, identifying:
   - Core message and key takeaways
   - Main arguments and supporting evidence
   - Natural narrative flow and logical structure
   - Key statistics, quotes, or memorable statements

2. **Create a presentation script** that:
   - Follows a clear narrative arc (introduction, body, conclusion)
   - Uses engaging, conversational language with direct audience address (use "you" and "we")
   - Includes presenter directions to point at or reference specific elements on slides
   - Incorporates live presenter phrases like "As you can see here," "Looking at this chart," "I want to draw your attention to"
   - Contains natural transitions between sections with audience engagement
   - Includes rhetorical questions, audience check-ins, and interactive elements
   - Creates the feeling of a live presentation rather than a recorded narration

3. **Divide the script into logical sections** (8-12 sections depending on content length)
   - Each section should focus on one key idea or point
   - Sections should build upon each other in a logical progression

4. **For each section, suggest a slide with**:
   - A clear, concise title (maximum 8 words)
   - Bullet points or key information to display (maximum 30-40 words per slide)
   - Visual element suggestions (chart type, image concept, or diagram if applicable)

## Output Format:

'''
# PRESENTATION TITLE: [Your suggested title]

## SECTION 1: [Section Name]
[Section script - full narration text for this section]

### SLIDE 1
- Title: [Slide title]
- Content:
  * [Key point 1]
  * [Key point 2]
  * [Visual suggestion if applicable]

## SECTION 2: [Section Name]
[Section script - full narration text for this section]

### SLIDE 2
- Title: [Slide title]
- Content:
  * [Key point 1]
  * [Key point 2]
  * [Visual suggestion if applicable]

[Continue pattern for all sections]

## CONCLUSION
[Conclusion script - full narration text]

### FINAL SLIDE
- Title: [Concluding slide title]
- Content:
  * [Summary point 1]
  * [Summary point 2]
  * [Call to action if applicable]
'''

Remember:
- Create content that feels like a live presenter speaking directly to an audience
- Include explicit cues for where the presenter should point, gesture, or reference visual elements
- Use natural presenter language like "Now, if we look at the right side of this diagram..." or "I'd like everyone to notice this trend here..."
- Insert audience engagement moments like "Has anyone here experienced this?" or "Think about the last time you..."
- Add brief pauses for audience reflection with phrases like "Take a moment to consider..."
- Prioritize clarity and audience connection over complexity
- Maintain the original message's integrity while adapting it for an engaging live presentation format
- Balance text and suggested visuals for maximum impact
- Create natural transitions between sections
- Aim for a presentation length of 5-10 minutes when spoken at a normal pace

INPUT

${articleText}
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
You are an expert presentation designer specializing in creating visually impactful slides with minimal text. Your task is to transform the script and slide suggestions into polished Markdown slides.

## Your Task:

You will receive:
1. A presentation script divided into sections
2. Slide suggestions for each section

Transform these into professional presentation slides in Markdown format that:
- Communicate key points visually and efficiently
- Follow best practices for slide design
- Use appropriate formatting hierarchy
- Include placeholders for visual elements

## Design Principles to Follow:

1. **Clarity and Simplicity**
   - One main idea per slide
   - Minimal text (5-7 bullet points maximum, 1-2 lines each)
   - Clear visual hierarchy using Markdown formatting

2. **Visual Structure**
   - Use appropriate headings ('#', '##', '###') for slide titles
   - Use bullet points ('-' or '*') for list items
   - Use bold ('**text**') and italic ('*text*') for emphasis
   - Use blockquotes ('>') for important quotes or callouts
   - Use horizontal rules ('---') to separate content sections when needed

3. **Visual Element Integration**
   - Include placeholders for charts, diagrams, or images using descriptive text
   - For charts/graphs, specify chart type and what it should display
   - For images, describe the ideal image concept
   - Add visual reference points that a presenter could point to (e.g., "[POINTER: Left data point]", "[REFERENCE: Bottom right corner]")
   - Create visual elements that support interactive presenter commentary

4. **Consistent Formatting**
   - Maintain consistent heading styles
   - Use parallel structure in bullet points
   - Balance text distribution across slides

## Output Format:

Your output must be valid Markdown formatted for a slide presentation, with clear slide separators. Include presentation guidance markers that support a live presenter experience. Use the following structure:

'''
# [Presentation Title]

---

## [Slide 1 Title]

### [Optional Subtitle]

- Key point 1
- Key point 2
- Key point 3

[IMAGE: Description of ideal image]
[POINTER: Description of specific element presenter should point to]

---

## [Slide 2 Title]

> Important quote or callout

- Supporting point 1
- Supporting point 2

[CHART: Description of chart type and data to display]
[REFERENCE: Key element for presenter to highlight]
[AUDIENCE ENGAGEMENT: Suggested question or interactive element]

---

[Continue this pattern for all slides]
'''

## Important Guidelines:

- Create approximately 10-15 slides total (adjust based on content length)
- First slide should be a title slide with presentation title and optional subtitle
- Include a brief agenda/overview slide early in the presentation
- Include a concluding slide that summarizes key takeaways
- For tables, use Markdown table syntax
- For code examples (if needed), use code blocks with appropriate syntax highlighting
- Use presenter notes syntax for guidance: '<!-- PRESENTER NOTE: Pause here for effect -->'
- Include visual reference markers like '[POINTER: Top right data point]' or '[HIGHLIGHT: Second bullet point]'
- Add audience interaction cues like '[AUDIENCE QUESTION: Ask about their experience]'
- Create visual elements that a presenter could naturally reference and point to
- Design slides that facilitate a conversational, engaging presentation style
- Ensure all Markdown is properly formatted and will render correctly

Transform the input content into a presentation that would impress a professional audience while effectively communicating the core message.

INPUT

${markdownFromStageOne}
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
      narration_text: z
        .string()
        .describe("In plain text, no markdown, no formatting"),
    })
  );

  const stageThreePrompt = `
You are an AI specialist in presentation-to-narration synchronization. Your task is to create a perfectly synchronized JSON mapping between presentation slides and their corresponding narration text.

## Your Task:

You will receive:
1. A set of presentation slides in Markdown format
2. A narration script that accompanies these slides

Create a JSON structure that maps each slide to its appropriate narration text, ensuring:
- Each slide has appropriately matched narration
- The narration flows naturally with the visual content
- The JSON structure is valid and follows the required schema

## Detailed Instructions:

1. **Analyze Both Inputs Carefully**
   - Understand the relationship between slides and narration
   - Identify natural break points in the narration that align with slide transitions
   - Ensure narration text explains and enhances slide content

2. **For Each Slide:**
   - Assign the appropriate slide number (sequential, starting from 1)
   - Include the exact Markdown content of the slide without modification
   - Write narration text that:
     * Creates a live presenter experience with direct audience address
     * Contains explicit references to visual elements (e.g., "As you can see in this chart...")
     * Includes presenter pointing cues (e.g., "Looking at this point here..." or "Let me draw your attention to...")
     * Incorporates audience engagement phrases (e.g., "Have you ever noticed that..." or "Think about a time when...")
     * Uses natural presentation language like "Now if we examine..." or "What's fascinating about this..."
     * Adds pauses for reflection with phrases like "Take a moment to consider..."
     * Provides smooth transitions between slides with audience awareness
     * Is conversational and designed to be spoken aloud in a live setting
     * Is timed appropriately (roughly 30-60 seconds per slide)

3. **For the JSON Structure:**
   - Follow the exact schema provided
   - Ensure all JSON is valid, with proper escaping of special characters
   - Maintain consistent formatting throughout

## Required JSON Schema:

'''json
[
  {
    "slide_number": 1,
    "slide_content": "# Slide Title\nSlide content in Markdown format...",
    "narration_text": "The full narration text that accompanies this slide..."
  },
  {
    "slide_number": 2,
    "slide_content": "## Next Slide\n- Bullet points\n- More content...",
    "narration_text": "The narration text for the second slide..."
  },
  ...
]
'''

## Important Guidelines:

1. **Live Presenter Experience**
   - Create narration that mimics a live presenter speaking directly to an audience
   - Include phrases that reference specific slide elements like "Looking at the data point I'm highlighting here"
   - Insert presenter movements with language like "Let me point out this trend" or "Notice this area of the chart"
   - Add audience connection moments: "I'm curious if anyone here has experienced this" or "You might be wondering..."
   - Include rhetorical questions directed at the audience
   - Create natural rhythm with pauses, emphasis moments, and conversational cadence
   - Use inclusive language like "we" and direct address with "you" to connect with the audience
   - Consider using phrases that simulate presenter gestures: "As you can see here on the left" or "Let's focus on this section"

2. **Technical Considerations**
   - Do not modify the original Markdown content

3. **Content Balance**
   - Title slides should have brief introductory narration
   - Complex slides may require longer explanations
   - Concluding slides should summarize key points
   - Narration should complement, not merely repeat, what's on the slide

4. **Quality Control**
   - Check that all JSON is properly formatted with no syntax errors
   - Verify that all slides have appropriate narration text
   - Ensure the full narration script flows logically when read sequentially

Your output will be the foundation for an automated presentation video, so accuracy in synchronization is critical for a professional result.

INPUT

${slidesMarkdown}

${originalMarkdown}
`;

  const result = await generateObject({
    model: google("gemini-2.5-pro-preview-03-25"),
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
    outputDir = ".output",
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
          const slideNumber = slide.slide_number.toString().padStart(3, "0");
          const narrationText = slide.narration_text;
          console.log(
            `[Slide ${slideNumber}] Processing narration (${narrationText.length} chars)`
          );

          const mp3FileName = `presentation.${slideNumber}.mp3`;
          const filePath = path.join(outputPath, mp3FileName);
          const slidePngPath = path.join(
            outputPath,
            `presentation.${slideNumber}.png`
          );

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
            slide_png_path: slidePngPath,
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

// Stage 5: Generate Marp-compatible Markdown presentation
async function generateMarpPresentation(enhancedContent, options = {}) {
  const {
    outputFile = "presentation.md",
    theme = "gaia",
    backgroundColor = "#fff",
    backgroundImage = "url('https://marp.app/assets/hero-background.svg')",
  } = options;

  console.log("Stage 5: Generating Marp-compatible presentation file...");

  // Create header with Marp directives
  let marpMarkdown = `---
theme: ${theme}
_class: lead
paginate: true
backgroundColor: ${backgroundColor}
backgroundImage: ${backgroundImage}
---\n\n`;

  // Process each slide
  for (const slide of enhancedContent) {
    // Extract slide content
    const slideContent = slide.slide_content.trim();

    // Add to Marp markdown
    marpMarkdown += slideContent + "\n\n";

    // Add separator between slides (except for the last slide)
    if (slide.slide_number < enhancedContent.length) {
      marpMarkdown += "---\n\n";
    }
  }

  // Save the Marp markdown to a file
  const outputPath = path.join(process.cwd(), ".output", outputFile);
  const outputDir = path.dirname(outputPath);

  // Create output directory if it doesn't exist
  if (!existsSync(outputDir)) {
    console.log(`Creating output directory: ${outputDir}`);
    await fs.mkdir(outputDir, { recursive: true });
  }

  await fs.writeFile(outputPath, marpMarkdown, "utf-8");
  console.log(`Marp presentation saved to ${outputPath}`);

  // Also save to debug directory
  const debugPath = path.join(
    process.cwd(),
    ".debug",
    "stage5_marp_presentation.md"
  );
  await fs.writeFile(debugPath, marpMarkdown, "utf-8");
  console.log("Stage 5 complete. Debug output saved.");

  return {
    marpMarkdown,
    outputPath,
  };
}

// Stage 6: Generate presentation deck images using Marp
async function generatePresentationImages(outputPath) {
  console.log("Stage 6: Generating presentation deck images using Marp...");

  try {
    // Run marp command to generate PNG images
    const command = `marp --images png ${outputPath}`;
    console.log(`Executing command: ${command}`);

    const output = execSync(command, { encoding: "utf8" });
    console.log(`Marp output: ${output}`);

    console.log("Stage 6 complete. Presentation deck images generated.");
    return true;
  } catch (error) {
    console.error("Error generating presentation images:", error);
    console.error(`Marp error: ${error.stderr}`);
    throw error;
  }
}

// Stage 7: Generate individual slide videos
async function generateSlideVideos(enhancedContent, options = {}) {
  console.log("Stage 7: Generating individual slide videos...");

  const { outputDir = ".output", tempDir = ".temp" } = options;

  // Create temp directory if it doesn't exist
  const tempPath = path.join(process.cwd(), tempDir);
  if (!existsSync(tempPath)) {
    console.log(`Creating temp directory: ${tempPath}`);
    await fs.mkdir(tempPath, { recursive: true });
  }

  const slideVideos = [];

  for (const slide of enhancedContent) {
    try {
      const slideNumber = slide.slide_number.toString().padStart(3, "0");
      console.log(`[Slide ${slideNumber}] Creating video...`);

      // Skip if missing audio or image
      if (!slide.narration_mp3_path || !existsSync(slide.narration_mp3_path)) {
        console.warn(`[Slide ${slideNumber}] Missing audio file, skipping`);
        continue;
      }

      // The PNG path should be in the output directory with naming pattern presentation.001.png
      const slidePngPath = path.join(
        process.cwd(),
        outputDir,
        `presentation.${slideNumber}.png`
      );
      if (!existsSync(slidePngPath)) {
        console.warn(
          `[Slide ${slideNumber}] Image file not found at ${slidePngPath}, skipping`
        );
        continue;
      }

      const outputVideoPath = path.join(tempPath, `slide_${slideNumber}.mp4`);

      // Create a video from the slide image with the duration of the audio
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(slidePngPath)
          .inputOptions(["-loop 1"])
          .input(slide.narration_mp3_path)
          .outputOptions([
            "-c:v libx264",
            "-tune stillimage",
            "-c:a aac",
            "-b:a 192k",
            "-pix_fmt yuv420p",
            "-shortest",
          ])
          .output(outputVideoPath)
          .on("end", () => {
            console.log(
              `[Slide ${slideNumber}] Video created: ${outputVideoPath}`
            );
            slideVideos.push({
              slideNumber: slide.slide_number,
              videoPath: outputVideoPath,
            });
            resolve();
          })
          .on("error", (err) => {
            console.error(
              `[Slide ${slideNumber}] Error creating video: ${err.message}`
            );
            reject(err);
          })
          .run();
      });
    } catch (error) {
      console.error(
        `Error generating video for slide ${slide.slide_number}:`,
        error
      );
    }
  }

  console.log(`Created ${slideVideos.length} individual slide videos`);
  return slideVideos;
}

// Stage 8: Combine slide videos into final presentation
async function combineSlideVideos(slideVideos, options = {}) {
  console.log("Stage 8: Combining slide videos into final presentation...");

  const { outputDir = ".output", outputFileName = "presentation.mp4" } =
    options;

  const outputPath = path.join(process.cwd(), outputDir, outputFileName);

  // Sort videos by slide number
  slideVideos.sort((a, b) => a.slideNumber - b.slideNumber);

  // Create a text file with the list of videos to concatenate
  const concatListPath = path.join(process.cwd(), ".temp", "concat_list.txt");
  const concatListContent = slideVideos
    .map((slide) => `file '${slide.videoPath}'`)
    .join("\n");

  await fs.writeFile(concatListPath, concatListContent, "utf-8");

  // Combine videos using ffmpeg concat demuxer
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .output(outputPath)
      .on("end", () => {
        console.log(`Final presentation video created: ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (err) => {
        console.error(`Error combining videos: ${err.message}`);
        reject(err);
      })
      .run();
  });
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

    // Create .output directory if it doesn't exist
    const outputDir = path.join(process.cwd(), ".output");
    if (!existsSync(outputDir)) {
      await fs.mkdir(outputDir, { recursive: true });
      console.log(`Created output directory: ${outputDir}`);
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

    // Save the final content data as JSON
    const contentOutputFile = path.join(
      process.cwd(),
      ".output",
      "presentation_data.json"
    );
    await fs.writeFile(
      contentOutputFile,
      JSON.stringify(enhancedContent, null, 2),
      "utf-8"
    );
    console.log(`Presentation data saved to ${contentOutputFile}`);

    // Stage 5: Generate Marp presentation
    const marpResult = await generateMarpPresentation(enhancedContent);
    console.log(
      `Marp presentation generated successfully at ${marpResult.outputPath}`
    );

    // Stage 6: Generate presentation deck images
    await generatePresentationImages(
      "/home/tajpouria/pro/src/github/tajpouria/presenter-ai/.output/presentation.md"
    );

    // Stage 7: Generate individual slide videos
    console.log("Stage 7: Creating individual slide videos...");
    const slideVideos = await generateSlideVideos(enhancedContent);
    console.log("Stage 7 complete. Individual slide videos created.");

    // Stage 8: Combine slide videos into final presentation
    console.log("Stage 8: Creating final presentation video...");
    const finalVideoPath = await combineSlideVideos(slideVideos);
    console.log(`Stage 8 complete. Final video created at: ${finalVideoPath}`);

    return {
      enhancedContent,
      marpPresentation: marpResult,
      finalVideoPath,
    };
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
  generateMarpPresentation,
  generatePresentationImages,
  generateSlideVideos,
  combineSlideVideos,
  run,
};

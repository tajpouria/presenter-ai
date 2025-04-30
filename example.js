// Example script to demonstrate how to use the Presenter AI module
const { run } = require("./presenter.js");

// Sample article text
const articleText = `
# Understanding Artificial Intelligence

Artificial Intelligence (AI) refers to computer systems designed to perform tasks that typically require human intelligence. These tasks include learning, reasoning, problem-solving, perception, and language understanding.

## Machine Learning: The Engine of AI

Machine learning is a subset of AI that focuses on building systems that learn from data. Instead of explicitly programming rules, machine learning algorithms identify patterns in data and make decisions based on these patterns.

There are three main types of machine learning:
1. Supervised Learning: Algorithms learn from labeled training data.
2. Unsupervised Learning: Algorithms find patterns in unlabeled data.
3. Reinforcement Learning: Algorithms learn through trial and error, receiving rewards or penalties.

## Deep Learning: The Neural Network Revolution

Deep learning uses artificial neural networks with multiple layers to analyze data. This architecture allows the system to process data in increasingly abstract ways, enabling breakthroughs in image recognition, natural language processing, and more.

## Applications of AI

AI is transforming numerous industries:
- Healthcare: Disease diagnosis and drug discovery
- Finance: Fraud detection and algorithmic trading
- Transportation: Self-driving vehicles
- Entertainment: Content recommendation systems

## Ethical Considerations

As AI becomes more powerful, important ethical questions arise:
- Privacy concerns regarding data collection
- Potential job displacement due to automation
- Algorithmic bias and fairness
- The need for transparency in AI decision-making

Understanding both the technical and ethical dimensions of AI is crucial for responsible development and deployment of these powerful technologies.
`;

// Run the presentation generation process
(async () => {
  try {
    console.log("Starting Presenter AI process...");
    await run(articleText);
    console.log("Check the presentation_data.json file for full results.");
  } catch (error) {
    console.error("Error running the presentation generator:", error);
  }
})();

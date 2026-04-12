#!/usr/bin/env node
/**
 * Verify that an ONNX model loads correctly in onnxruntime-node.
 *
 * Usage: node tools/verify_onnx.js <model.onnx>
 */
const ort = require("onnxruntime-node");

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node tools/verify_onnx.js <model.onnx>");
    process.exit(1);
  }
  const session = await ort.InferenceSession.create(path);
  console.log("OK — inputs:", session.inputNames);
  console.log("OK — outputs:", session.outputNames);
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});

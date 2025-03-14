import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import * as vscode from 'vscode';

const codeChangeSchema = z.object({
  requires_code_changes: z.boolean()
});

const getApiKey = (): string => {
  const config = vscode.workspace.getConfiguration('durrsor');
  return config.get<string>('apiKey') || process.env.OPENAI_API_KEY || '';
};

export const codeChangesRequired = async (state: any) => {
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0,
    streaming: false,
    apiKey: getApiKey()
  });

  const systemMessage = new SystemMessage(
    `Analyze if the LLM analysis requires any code changes. Focus mostly on human's prompt as the LLM response might be overly eager to suggest code changes.
     Respond with a boolean value only.
     Return true if any files need to be modified, created, or deleted.
     Return false if the request is just for information, explanation, or analysis.`
  );
  
  const humanMessages = state.messages.filter((msg: BaseMessage) => msg._getType() === 'human');
  const latestHumanMessage = humanMessages[humanMessages.length - 1];

  const modelWithStructure = model.withStructuredOutput(codeChangeSchema);
  const response = await modelWithStructure.invoke([
    systemMessage,
    latestHumanMessage,
    state.messages[state.messages.length - 1]
  ]);

  return response.requires_code_changes ? 'true' : 'false';
}; 
import { BaseMessage, BaseMessageFields, MessageType } from "@langchain/core/messages";

export class GitCheckpointMessage extends BaseMessage {
    _getType(): MessageType {
        return "system" as MessageType;
    }
} 
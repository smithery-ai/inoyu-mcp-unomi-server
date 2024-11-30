#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import {
  UnomiProfile,
  UnomiContext,
  GetProfileArgs,
  SearchProfilesArgs,
  isValidGetProfileArgs,
  isValidSearchProfilesArgs,
  GetMyProfileArgs,
  isValidGetMyProfileArgs,
  generateSessionId,
  UpdateMyProfileArgs,
  isValidUpdateMyProfileArgs,
  UnomiScope,
  CreateScopeArgs,
  isValidCreateScopeArgs,
} from "./types.js";
import fs from 'fs';

// Create a simple logging function
function log(message: string) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync('/Users/loom/temp/mcp-server.log', `${timestamp}: ${message}\n`);
}

// Use it in your code
log('MCP server started');

dotenv.config();

const UNOMI_BASE_URL = process.env.UNOMI_BASE_URL || 'http://localhost:8181';
const UNOMI_USERNAME = process.env.UNOMI_USERNAME;
const UNOMI_PASSWORD = process.env.UNOMI_PASSWORD;
const UNOMI_PROFILE_ID = process.env.UNOMI_PROFILE_ID;
const UNOMI_SOURCE_ID = process.env.UNOMI_SOURCE_ID || 'claude-desktop';
const UNOMI_KEY = process.env.UNOMI_KEY;
const UNOMI_EMAIL = process.env.UNOMI_EMAIL;

if (!UNOMI_USERNAME || !UNOMI_PASSWORD) {
  throw new Error("UNOMI_USERNAME and UNOMI_PASSWORD environment variables are required");
}

if (!UNOMI_KEY) {
  throw new Error("UNOMI_KEY environment variable is required for protected events");
}

if (!UNOMI_PROFILE_ID) {
  throw new Error("UNOMI_PROFILE_ID environment variable is required as fallback");
}

const API_CONFIG = {
  BASE_URL: UNOMI_BASE_URL,
  ENDPOINTS: {
    PROFILE: '/cxs/profiles',
    SEARCH: '/cxs/profiles/search',
    SESSION: '/cxs/sessions',
    CONTEXT: '/context.json',
    SCOPE: '/cxs/scopes'
  }
} as const;

class UnomiServer {
  private server: Server;
  private axiosInstance;
  private defaultScope = 'claude-desktop';

  constructor() {
    this.server = new Server({
      name: "unomi-profile-server",
      version: "0.1.0"
    }, {
      capabilities: {
        resources: {},
        tools: {}
      }
    });

    // Configure axios with defaults
    this.axiosInstance = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      auth: {
        username: UNOMI_USERNAME!,
        password: UNOMI_PASSWORD!
      },
      headers: {
        'X-Unomi-Peer': UNOMI_KEY
      }
    });

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    this.setupResourceHandlers();
    this.setupToolHandlers();
  }

  private setupResourceHandlers(): void {
    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      async () => ({
        resources: [{
          uri: `unomi://profiles/list`,
          name: `Unomi Profiles`,
          mimeType: "application/json",
          description: "List of available Apache Unomi profiles"
        }]
      })
    );

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        log("Request:" + JSON.stringify(request, null, 2));
        if (request.params.uri !== 'unomi://profiles/list') {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Unknown resource: ${request.params.uri}`
          );
        }

        try {
          const response = await this.axiosInstance.post(
            API_CONFIG.ENDPOINTS.SEARCH,
            {
              offset: 0,
              limit: 10,
              condition: {
                type: "matchAllCondition"
              }
            }
          );

          return {
            contents: [{
              uri: request.params.uri,
              mimeType: "application/json",
              text: JSON.stringify(response.data, null, 2)
            }]
          };
        } catch (error) {
          if (axios.isAxiosError(error)) {
            throw new McpError(
              ErrorCode.InternalError,
              `Unomi API error: ${error.response?.data?.message ?? error.message}`
            );
          }
          throw error;
        }
      }
    );
  }

  private async ensureScopeExists(scope: string = this.defaultScope): Promise<void> {
    try {
      // Try to get the scope
      const response = await this.axiosInstance.get(`${API_CONFIG.ENDPOINTS.SCOPE}/${scope}`);
      
      // Check if scope doesn't exist (204 status or empty response)
      if (response.status === 204 || !response.data || Object.keys(response.data).length === 0) {
        // Create the scope
        const scopeData: UnomiScope = {
          itemId: scope,
          itemType: 'scope',
          metadata: {
            id: scope,
            name: `Claude Desktop Scope - ${scope}`,
          description: 'Automatically created scope for Claude Desktop MCP Server',
            scope: scope
          }
        };

        await this.axiosInstance.post(API_CONFIG.ENDPOINTS.SCOPE, scopeData);
      }
      // If we get here with data, the scope exists
    } catch (error) {
      // Handle other potential errors
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to check/create scope: ${error.response?.data?.message ?? error.message}`
        );
      }
      throw error;
    }
  }

  private async findProfileByEmail(email: string): Promise<string | null> {
    try {
      const response = await this.axiosInstance.post(
        API_CONFIG.ENDPOINTS.SEARCH,
        {
          condition: {
            type: "profilePropertyCondition",
            parameterValues: {
              propertyName: "properties.email",
              comparisonOperator: "equals",
              propertyValue: email
            }
          },
          limit: 1
        }
      );

      if (response.data && response.data.list && response.data.list.length > 0) {
        return response.data.list[0].itemId;
      }

      return null;
    } catch (error) {
      console.error('Error looking up profile by email:', error);
      return null;
    }
  }

  private async getEffectiveProfileId(): Promise<string> {
    if (UNOMI_EMAIL) {
      const existingProfileId = await this.findProfileByEmail(UNOMI_EMAIL);
      if (existingProfileId) {
        return existingProfileId;
      }
      // If profile not found by email, create it with the email property
      const profileId = UNOMI_PROFILE_ID!;
      try {
        const sessionId = generateSessionId(profileId);
        const contextData: UnomiContext = {
          sessionId,
          profileId,
          source: {
            itemId: UNOMI_SOURCE_ID,
            itemType: "claude",
            scope: "claude-desktop"
          },
          events: [{
            eventType: "updateProperties",
            scope: "claude-desktop",
            source: {
              itemId: UNOMI_SOURCE_ID,
              itemType: "claude",
              scope: "claude-desktop"
            },
            target: {
              itemId: profileId,
              itemType: "profile",
              scope: "claude-desktop"
            },
            properties: {
              update: {
                "properties.email": UNOMI_EMAIL
              }
            }
          }]
        };

        await this.axiosInstance.post(API_CONFIG.ENDPOINTS.CONTEXT, contextData);
      } catch (error) {
        console.error('Error setting email for new profile:', error);
      }
      return profileId;
    }
    return UNOMI_PROFILE_ID!;
  }

  private async handleMyProfileOperation<T>(
    operation: (profileId: string, args: any) => Promise<T>, 
    args: any
  ): Promise<T> {
    const profileId = await this.getEffectiveProfileId();
    return operation(profileId, args);
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async () => ({
        tools: [
          {
            name: "create_scope",
            description: "Create a new Unomi scope",
            inputSchema: {
              type: "object",
              properties: {
                scope: {
                  type: "string",
                  description: "Scope identifier"
                },
                name: {
                  type: "string",
                  description: "Human-readable name for the scope"
                },
                description: {
                  type: "string",
                  description: "Description of the scope"
                }
              },
              required: ["scope"]
            }
          },
          {
            name: "update_my_profile",
            description: "Update properties of your profile using environment-provided ID",
            inputSchema: {
              type: "object",
              properties: {
                properties: {
                  type: "object",
                  description: "Key-value pairs of properties to update",
                  additionalProperties: {
                    type: ["string", "number", "boolean", "null"]
                  }
                }
              },
              required: ["properties"]
            }
          },
          {
            name: "get_my_profile",
            description: "Get your profile using environment-provided IDs",
            inputSchema: {
              type: "object",
              properties: {
                requireSegments: {
                  type: "boolean",
                  description: "Whether to include segments in the response"
                },
                requireScores: {
                  type: "boolean",
                  description: "Whether to include scores in the response"
                }
              }
            }
          },
          {
            name: "get_profile",
            description: "Get a specific Unomi profile by ID",
            inputSchema: {
              type: "object",
              properties: {
                profileId: {
                  type: "string",
                  description: "Profile ID"
                }
              },
              required: ["profileId"]
            }
          },
          {
            name: "search_profiles",
            description: "Search Unomi profiles",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results"
                },
                offset: {
                  type: "number",
                  description: "Result offset for pagination"
                }
              },
              required: ["query"]
            }
          }
        ]
      })
    );

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        log("Request:" + JSON.stringify(request, null, 2));
        switch (request.params.name) {
          case "create_scope": {
            if (!isValidCreateScopeArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid create scope arguments"
              );
            }

            try {
              const scopeData: UnomiScope = {
                itemId: request.params.arguments.scope,
                itemType: 'scope',
                metadata : {
                  id: request.params.arguments.scope,
                  name: request.params.arguments.name,
                  description: request.params.arguments.description,
                  scope: request.params.arguments.scope
                }
              };

              await this.axiosInstance.post(API_CONFIG.ENDPOINTS.SCOPE, scopeData);

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    message: "Scope created successfully",
                    scope: scopeData
                  }, null, 2)
                }]
              };
            } catch (error) {
              if (axios.isAxiosError(error)) {
                return {
                  content: [{
                    type: "text",
                    text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                  }],
                  isError: true,
                };
              }
              throw error;
            }
          }

          case "update_my_profile": {
            await this.ensureScopeExists();

            if (!isValidUpdateMyProfileArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid update profile arguments"
              );
            }

            const args = request.params.arguments;
            return this.handleMyProfileOperation(async (profileId, args) => {
              try {
                const sessionId = generateSessionId(profileId);
                const contextData: UnomiContext = {
                  sessionId,
                  profileId,
                  source: {
                    itemId: UNOMI_SOURCE_ID,
                    itemType: "claude",
                    scope: "claude-desktop"
                  },
                  events: [{
                    eventType: "updateProperties",
                    scope: "claude-desktop",
                    source: {
                      itemId: UNOMI_SOURCE_ID,
                      itemType: "claude",
                      scope: "claude-desktop"
                    },
                    target: {
                      itemId: profileId,
                      itemType: "profile",
                      scope: "claude-desktop"
                    },
                    properties: {
                      update: Object.fromEntries(
                        Object.entries(args.properties).map(([key, value]) => [
                          `properties.${key}`, value
                        ])
                      )
                    }
                  }]
                };

                const response = await this.axiosInstance.post(
                  API_CONFIG.ENDPOINTS.CONTEXT,
                  contextData
                );

                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      message: "Profile properties updated successfully",
                      updatedProperties: args.properties,
                      profileId: profileId,
                      sessionId: sessionId,
                      source: UNOMI_EMAIL ? "email_lookup" : "environment"
                    }, null, 2)
                  }]
                };
              } catch (error) {
                if (axios.isAxiosError(error)) {
                  return {
                    content: [{
                      type: "text",
                      text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                    }],
                    isError: true,
                  };
                }
                throw error;
              }
            }, args);
          }

          case "get_my_profile": {
            await this.ensureScopeExists();

            if (!isValidGetMyProfileArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid get my profile arguments"
              );
            }

            const args = request.params.arguments;
            return this.handleMyProfileOperation(async (profileId, args) => {
              try {
                const sessionId = generateSessionId(profileId);
                const contextData: UnomiContext = {
                  sessionId,
                  profileId,
                  source: {
                    itemId: UNOMI_SOURCE_ID,
                    itemType: "claude",
                    scope: "claude-desktop"
                  },
                  requiredProfileProperties: ["*"],
                  requiredSessionProperties: ["*"],
                  requireSegments: args.requireSegments,
                  requireScores: args.requireScores
                };

                const response = await this.axiosInstance.post(
                  API_CONFIG.ENDPOINTS.CONTEXT,
                  contextData
                );

                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      profile: response.data.profileProperties,
                      session: response.data.sessionProperties,
                      segments: response.data.profileSegments,
                      scores: response.data.profileScores,
                      sessionId: sessionId,
                      profileId: profileId,
                      source: UNOMI_EMAIL ? "email_lookup" : "environment"
                    }, null, 2)
                  }]
                };
              } catch (error) {
                if (axios.isAxiosError(error)) {
                  return {
                    content: [{
                      type: "text",
                      text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                    }],
                    isError: true,
                  };
                }
                throw error;
              }
            }, args);
          }

          case "get_profile": {
            if (!isValidGetProfileArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid profile arguments"
              );
            }

            try {
              const response = await this.axiosInstance.get<UnomiProfile>(
                `${API_CONFIG.ENDPOINTS.PROFILE}/${request.params.arguments.profileId}`
              );

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify(response.data, null, 2)
                }]
              };
            } catch (error) {
              if (axios.isAxiosError(error)) {
                return {
                  content: [{
                    type: "text",
                    text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                  }],
                  isError: true,
                };
              }
              throw error;
            }
          }

          case "search_profiles": {
            if (!isValidSearchProfilesArgs(request.params.arguments)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid search arguments"
              );
            }

            try {
              const { query, limit = 10, offset = 0 } = request.params.arguments;
              const response = await this.axiosInstance.post(
                API_CONFIG.ENDPOINTS.SEARCH,
                {
                  offset,
                  limit,
                  condition: {
                    type: "booleanCondition",
                    parameterValues : {
                      operator: "or",
                      subConditions: [
                        {
                          type: "profilePropertyCondition",
                          parameterValues : {
                            propertyName: "properties.firstName",
                            comparisonOperator: "contains",
                            propertyValue: query  
                          }
                        },
                        {
                          type: "profilePropertyCondition",
                          parameterValues : {
                            propertyName: "properties.lastName",
                            comparisonOperator: "contains",
                            propertyValue: query
                          }
                        },
                        {
                          type: "profilePropertyCondition",
                          parameterValues : {
                            propertyName: "properties.email",
                            comparisonOperator: "contains",
                            propertyValue: query
                          }
                        }
                      ]  
                    }
                  }
                }
              );

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify(response.data, null, 2)
                }]
              };
            } catch (error) {
              if (axios.isAxiosError(error)) {
                return {
                  content: [{
                    type: "text",
                    text: `Unomi API error: ${error.response?.data?.message ?? error.message}`
                  }],
                  isError: true,
                };
              }
              throw error;
            }
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      }
    );
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Unomi MCP server running on stdio");
  }
}

const server = new UnomiServer();
server.run().catch(console.error);

import "source-map-support/register";
import * as Alexa from 'ask-sdk';
import { HandlerInput } from "ask-sdk";
var AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
var alexaCookbook = require('./alexa-cookbook.js');

const PubNub = require('pubnub');
const pubnub = new PubNub({ publishKey: "pub-c-6592a63e-134f-4327-9ed7-b2f36a38b8b2", subscribeKey: "sub-c-6ba13e32-38a0-11e9-b5cf-1e59042875b2" });

const LaunchRequestHandler = {
    canHandle(handlerInput: HandlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    async handle(handlerInput: HandlerInput) {
        const attributesManager = handlerInput.attributesManager;
        const responseBuilder = handlerInput.responseBuilder;

        var reprompt = " What shall we do?";
        var speechText = "Welcome to the Unity Plus Alexa Test!";

        var response = responseBuilder
            .speak(speechText + reprompt)
            .reprompt(reprompt)
            .getResponse();

        attributesManager.setPersistentAttributes({ CHANNEL: "ABC" });
        await attributesManager.savePersistentAttributes();
        return response;
    }
};




const TextWorldCommandHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'TextWorldCommand';
    },
    async handle(handlerInput) {
        const command = handlerInput.requestEnvelope.request.intent.slots.Command.value;
        const payload = { command: command };
        return await sendTextWorldMessage(payload, null, handlerInput);
    }
};


const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent'
                || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speechText = 'Goodbye!';
        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    },
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);
        return handlerInput.responseBuilder.getResponse();
    },
};


const speechOutputs = {
    errors: {
        speak: [
            "Error!",
            "There was an issue!"
        ],
        reprompt: [
            " Please try again.",
            " Please try again later."
        ]
    },
};
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`Error handled: ${error.message}`);

        var errorReprompt = alexaCookbook.getRandomItem(speechOutputs.errors.reprompt);
        var errorSpeech = alexaCookbook.getRandomItem(speechOutputs.errors.speak) + errorReprompt;
        return handlerInput.responseBuilder
            .speak(errorSpeech)
            .reprompt(errorReprompt)
            .getResponse();
    },
};

const skillBuilder = Alexa.SkillBuilders.standard();

export const handler = skillBuilder
    .addRequestHandlers(
        LaunchRequestHandler,
        TextWorldCommandHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler
    )
    .addErrorHandlers(ErrorHandler)
    .withTableName('TextWorldSkill')
    .withAutoCreateTable(true)
    .lambda();


function publishMessage(message, channel) {
    return new Promise((resolve, reject) => {
        var params = {
            message: message,
            channel: channel + "A"
        };
        pubnub.publish(params, function (status, response) {
            if (status.error) {
                console.log("Error", status);
                reject(status);
            } else {
                console.log("Publish Success", response);
                resolve(response);
            }
        });
    });
}


function publishMessageAndListenToResponse(message, channel) {
    return new Promise((resolve, reject) => {
        var listener = {
            status: async function (statusEvent) {
                if (statusEvent.category === "PNConnectedCategory") {
                    await publishMessage(message, channel)
                }
            },
            message: function (msg) {
                pubnub.removeListener(listener);
                pubnub.stop();
                console.log("Subscribe Success", msg);
                resolve(msg);
            }
        };
        pubnub.addListener(listener);
        pubnub.subscribe({
            channels: [channel + "B"]
        });
    });
}



async function sendTextWorldMessage(payload: any, reprompt: string | null, handler: HandlerInput) {
    const attributes = await handler.attributesManager.getPersistentAttributes();

    const response = await publishMessageAndListenToResponse(payload, attributes.CHANNEL).then((data: any) => {
        const speechText = data.message.feedback;
        return handler.responseBuilder
            .speak(speechText)
            .reprompt(reprompt ? reprompt : speechText)
            .getResponse();
    }).catch((err) => {
        return ErrorHandler.handle(handler, err);
    });
    return response;
}


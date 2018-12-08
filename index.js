const Telegraf = require('telegraf');
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Scene = require('telegraf/scenes/base');
const {leave} = Stage;
const Emoji = require('node-emoji');
const TelegrafI18n = require('telegraf-i18n');
const Extra = require('telegraf/extra');
const Markup = require('telegraf/markup');
const CryptoJS = require("crypto-js");
const Bcrypt = require('bcrypt');
const path = require('path');
const Validator = require('validator');
const EmailValidator = require("email-validator");
const _ = require('underscore');
const parseDomain = require("parse-domain");
const generator = require('generate-password');
const AWS = require('aws-sdk');
const Addrs = require("email-addresses");
const Moment = require('moment');
const EndDate = Moment(process.env.CLOSING_DATETIME, "YYYY-MM-DD HH:mm").local();
AWS.config.update({region: 'eu-west-1'});


/////////////////////////////// Language Picker Scene
const language = new Scene('language');
language.enter((ctx) => {
    console.log("[INFO] - start command, choosing language");
    ctx.reply('Tria idioma / Selecciona idioma', Extra.HTML().markup((m) =>
        m.inlineKeyboard([
            m.callbackButton('Valencià', 'va'),
            m.callbackButton('Castellano', 'es')
        ])))
});


language.on('callback_query', ctx => {
    let answer = ctx.callbackQuery.data;
    if (answer === 'es') {
        ctx.answerCbQuery("Castellano");
        console.log("[INFO] - Changing to Spanish via callback");
        ctx.i18n.locale('es');
        if(!isTimeToClose()){
            ctx.scene.enter('greeter');
        }else{
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
        }

    } else if (answer === 'va') {
        ctx.answerCbQuery("Valencià");
        console.log("[INFO] - Changing to Catalan via callback");
        ctx.i18n.locale('va');
        if(!isTimeToClose()){
            ctx.scene.enter('greeter');
        }else{
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
        }
    }

});
///////////////////////////////


/////////////////////////////// Greeter Scene
const greeter = new Scene('greeter');
greeter.enter((ctx) => {
    console.log("[INFO] - start command - user: " + ctx.from.first_name);
    ctx.reply(Emoji.emojify(ctx.i18n.t('greeting', {
        user_name: ctx.from.first_name
    }))).then(function () {
        if(!isTimeToClose()){
            ctx.scene.enter('email');
        }else{
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
        }

    });

});
///////////////////////////////


/////////////////////////////// Email Scene
const email = new Scene('email');
email.on('message', (ctx) => {
    console.log("[INFO] - Email scene");

    if (ctx.message.text && EmailValidator.validate(ctx.message.text)) {
        let domain = ctx.message.text.replace(/.*@/, "");
        let emailAdd = Addrs.parseOneAddress(ctx.message.text);
        let emailUser = emailAdd.local;
        let parsedDomain = parseDomain(domain);

        let cypEmail = CryptoJS.SHA3(ctx.message.text);
        let cypEmailUser = CryptoJS.SHA3(emailUser);

        let docClient = new AWS.DynamoDB;
        let query = {
            TableName: "voter_email",
            Key: {
                'user': {"S": cypEmailUser.toString()},
            }
        };

        docClient.getItem(query, function (err, data) {
            console.log("[INFO] - Email query succeeded.");
            if (err) {
                console.error("[INFO] - Email unable to query. Error:", JSON.stringify(err, null, 2));
            } else if (data.Item) {
                //Email found.
                console.log("[INFO] - An email was found...");
                console.log(data.Item);
                if (data.Item.has_voted.N == 1) {
                    //User has voted. Error and block.
                    console.log("[INFO] - User already voted...");
                    ctx.reply(Emoji.emojify(ctx.i18n.t('hasVoted')));
                    if(!isTimeToClose()){
                        ctx.scene.enter('voted');
                    }else{
                        ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
                    }


                } else if (data.Item.has_voted.N == 0) {
                    //User has not voted. Proceed.
                    ctx.reply(Emoji.emojify(ctx.i18n.t('emailCorrect')));
                    ctx.session.voterType = 1;
                    ctx.session.password = generator.generate({
                        length: 4,
                        numbers: true,
                        uppercase: false,
                        excludeSimilarCharacters: true,
                        exclude: 'abcdefghijklmnopqrstuvwxyz'

                    });
                    ctx.session.email = cypEmail.toString();
                    ctx.session.emailUser = cypEmailUser.toString();

                    sendEmail(ctx).then(function (ko, ok) {
                        if (ko) {
                            console.error("ERR");
                        } else {
                            console.log("[INFO] - password scene");
                            if(!isTimeToClose()){
                                ctx.scene.enter('password');
                            }else{
                                ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
                            }

                        }

                    })

                }
            } else {
                //Email not found. Proceed.
                if (_.isEqual(parsedDomain.domain, process.env.VERIFY_DOMAIN)) {
                    //Email is domain verified.
                    ctx.reply(Emoji.emojify(ctx.i18n.t('emailCorrect')));
                    ctx.session.voterType = 0;
                    ctx.session.password = generator.generate({
                        length: 4,
                        numbers: true,
                        uppercase: false,
                        excludeSimilarCharacters: true,
                        exclude: 'abcdefghijklmnopqrstuvwxyz'

                    });
                    ctx.session.email = cypEmail.toString();
                    ctx.session.emailUser = cypEmailUser.toString();
                    ctx.session.passwordCount = 0;

                    sendEmail(ctx, password).then(function (ko, ok) {
                        if (ko) {
                            console.error("ERR");
                        } else {
                            console.log("[INFO] - password scene");
                            if(!isTimeToClose()){
                                ctx.scene.enter('password');
                            }else{
                                ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
                            }
                        }

                    })

                } else {
                    //Email is not UPV nor authorised. Error and block.
                    ctx.reply(Emoji.emojify(ctx.i18n.t('emailNotCorrect')));
                }
            }


        });
    }

    else {
        console.log("Format ERROR");
        ctx.reply(Emoji.emojify(ctx.i18n.t('unexpected')));
    }

});
///////////////////////////////


/////////////////////////////// Password Scene
const password = new Scene('password');
password.on('message', (ctx) => {
    ctx.session.passwordCount = ctx.session.passwordCount + 1;
    if(ctx.session.passwordCount <4){
        if (_.isEqual(ctx.session.password, ctx.message.text)) {
            ctx.reply(ctx.i18n.t('passwordCorrect')).then(function () {
                if(!isTimeToClose()){
                    ctx.scene.enter('vote1');
                }else{
                    ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
                }
            })
        }else{
            ctx.reply(ctx.i18n.t('passwordNotCorrect'))
        }
    }else{
        ctx.reply(ctx.i18n.t('tooManyAttempts'))
    }
});
///////////////////////////////


/////////////////////////////// Vote1 Scene
const vote1 = new Scene('vote1');
vote1.enter((ctx) => {
    ctx.reply(ctx.i18n.t('vote1'), Extra.HTML().markup((m) =>
        m.inlineKeyboard([
            m.callbackButton('Sí', 'Sí'),
            m.callbackButton('No', 'No'),
            m.callbackButton(ctx.i18n.t('abs'), 'abs')
        ])))
});


vote1.on('callback_query', ctx => {
    console.log("[INFO] - Vote1 recieved");
    ctx.session.vote1 = ctx.callbackQuery.data;
    if (_.isEqual("Sí", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("Sí");
        if(!isTimeToClose()){
            ctx.scene.enter('vote2');
        }else{
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
        }

    } else if (_.isEqual("No", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("No");
        if(!isTimeToClose()){
            ctx.scene.enter('verify');
        }else{
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
        }

    } else {
        ctx.answerCbQuery(ctx.i18n.t('abs'));
        if(!isTimeToClose()){
            ctx.scene.enter('verify');
        }else{
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
        }
    }

});
///////////////////////////////


/////////////////////////////// Vote2 Scene
const vote2 = new Scene('vote2');
vote2.enter((ctx) => {
    ctx.reply(ctx.i18n.t('vote2'), Extra.HTML().markup((m) =>
        m.inlineKeyboard([
            m.callbackButton('Sí', 'Sí'),
            m.callbackButton('No', 'No'),
            m.callbackButton(ctx.i18n.t('abs'), 'abs')
        ])))
});


vote2.on('callback_query', ctx => {
    console.log("[INFO] - Vote2 recieved");
    ctx.session.vote2 = ctx.callbackQuery.data;
    if (_.isEqual("Sí", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("Sí");
        if(!isTimeToClose()){
            ctx.scene.enter('verify');
        }else{
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
        }

    } else if (_.isEqual("No", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("No");
        if(!isTimeToClose()){
            ctx.scene.enter('verify');
        }else{
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
        }

    } else {
        ctx.answerCbQuery(ctx.i18n.t('abs'));
        if(!isTimeToClose()){
            ctx.scene.enter('verify');
        }else{
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
        }
    }

});
///////////////////////////////


/////////////////////////////// Verify Scene
const verify = new Scene('verify');
verify.enter((ctx) => {
    let answer = "";
    if (!ctx.session.vote2) {
        answer = 'verify1'
    } else {
        answer = 'verify'
    }
    ctx.replyWithMarkdown(Emoji.emojify(ctx.i18n.t(answer, {
        vote1: ctx.session.vote1,
        vote2: ctx.session.vote2
    })), Extra.HTML().markup((m) =>
        m.inlineKeyboard([
            m.callbackButton('Sí', 'Sí'),
            m.callbackButton('No', 'No')
        ])))
});


verify.on('callback_query', ctx => {
    console.log("[INFO] - Verifying");
    if (_.isEqual("Sí", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("Sí");

        if (ctx.session.voterType === 0) {
            let docClient = new AWS.DynamoDB.DocumentClient();
            let item = {
                TableName: 'voter_email',
                Item: {
                    "user": ctx.session.emailUser,
                    "has_voted": 1
                }
            };

            console.log("Adding a new item...");
            docClient.put(item, function (err, data) {
                if (err) {
                    console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
                } else {
                    console.log("Added item:", JSON.stringify(data, null, 2));
                }
            });
        } else if (ctx.session.voterType === 1) {
            let docClient = new AWS.DynamoDB.DocumentClient();
            let item = {
                TableName: 'voter_email',
                Key: {
                    'user': ctx.session.emailUser
                },
                UpdateExpression: "set has_voted = :hv",
                ExpressionAttributeValues: {
                    ":hv": 1
                },
                ReturnValues: "UPDATED_NEW"
            };
            console.log(JSON.stringify(item));

            console.log("Updating the item...");
            docClient.update(item, function (err, data) {
                if (err) {
                    console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
                } else {
                    console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
                }
            });
        }


        ctx.reply(ctx.i18n.t('thanks'));
        //TODO: STORE THE VOTE




        if(!isTimeToClose()){
            ctx.scene.enter('voted')
        }else{
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
        }

    } else {
        ctx.answerCbQuery("No");
        if(!isTimeToClose()){
            ctx.scene.enter('vote1')
        }else{
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
        }
    }

});
///////////////////////////////



/////////////////////////////// Voted Scene
const voted = new Scene('voted');
voted.on('message', (ctx) => {
    ctx.reply(Emoji.emojify(ctx.i18n.t('thanks')));

});
///////////////////////////////




// Create scene manager
const stage = new Stage();
stage.command('cancelar', leave());


// Scene registration
stage.register(language);
stage.register(greeter);
stage.register(email);
stage.register(password);
stage.register(vote1);
stage.register(vote2);
stage.register(verify);
stage.register(voted);


const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const i18n = new TelegrafI18n({
    useSession: true,
    defaultLanguage: 'es',
    allowMissing: true,
    directory: path.resolve(__dirname, 'locales')
});


bot.catch((err) => {
    console.log('[ERROR] - ', err)
});

bot.use(session());
bot.use(i18n.middleware());
bot.use(stage.middleware());

console.log("[INFO] - Init...");

bot.command('start', (ctx) => {
    console.log("[INFO] - Start command");
    console.log("Time to close? "+isTimeToClose());
    if(!isTimeToClose()){
        ctx.scene.enter('language')
    }else{
        ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
    }
});


bot.startPolling();




//Sends an emails with the code to the voter
function sendEmail(ctx) {
    return new Promise(function (resolve, reject) {

        let params = {
            Destination: {
                ToAddresses: [ctx.message.text],
                BccAddresses: [process.env.GDPR_BCC]
            },
            Message: {
                Body: {
                    Text: {
                        Charset: "UTF-8",
                        Data: ctx.i18n.t('emailBody') + ctx.session.password
                    }
                },
                Subject: {
                    Charset: 'UTF-8',
                    Data: ctx.i18n.t('emailSubject')
                }
            },
            Source: process.env.SENDER_EMAIL,
            ReplyToAddresses: [
                process.env.SENDER_EMAIL
            ],
        };

        let sendPromise = new AWS.SES().sendEmail(params).promise();

        sendPromise.then(
            function (data) {
                console.log("[INFO] - Email sent correctly: "+data.MessageId);
                return resolve();
            }).catch(
            function (err) {
                console.error("[ERROR] - Email error:" + err, err.stack);
                return reject();
            });

    })
}

//Sends an email to the authorities with the vote
function sendEmailVote(vote){
    return new Promise(function (resolve, reject) {

        let params = {
            Destination: {
                ToAddresses: ["authority1@gmail.com", "authority2@gmail.com"]
            },
            Message: {
                Body: {
                    Text: {
                        Charset: "UTF-8",
                        Data: vote
                    }
                },
                Subject: {
                    Charset: 'UTF-8',
                    Data: "Nuevo voto"
                }
            },
            Source: process.env.SENDER_EMAIL,
            ReplyToAddresses: [
                process.env.SENDER_EMAIL
            ],
        };

        let sendPromise = new AWS.SES().sendEmail(params).promise();

        sendPromise.then(
            function (data) {
                console.log("[INFO] - Email sent correctly: "+data.MessageId);
                return resolve();
            }).catch(
            function (err) {
                console.error("[ERROR] - Email error:" + err, err.stack);
                return reject();
            });

    })
}


function isTimeToClose(){
    let now = Moment().local();
    console.log("NOW:" + now.toString());
    console.log("END DATE: "+EndDate.toString());
    return now.isAfter(EndDate)
}
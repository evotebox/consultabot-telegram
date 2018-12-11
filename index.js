const Telegraf = require('telegraf');
const LocalSession = require('telegraf-session-local');
const Stage = require('telegraf/stage');
const Scene = require('telegraf/scenes/base');
const uuidv1 = require('uuid/v1');
const Emoji = require('node-emoji');
const TelegrafI18n = require('telegraf-i18n');
const Extra = require('telegraf/extra');
const CryptoJS = require("crypto-js");
const path = require('path');
const EmailValidator = require("email-validator");
const _ = require('underscore');
const parseDomain = require("parse-domain");
const generator = require('generate-password');
const AWS = require('aws-sdk');
const Addrs = require("email-addresses");
const Moment = require('moment');
const EndDate = Moment(process.env.CLOSING_DATETIME, "YYYY-MM-DD HH:mm").local();
AWS.config.update({region: 'eu-west-1'});

const db = new AWS.DynamoDB;
const docClient = new AWS.DynamoDB.DocumentClient();

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Pick language Scene
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const language = new Scene('language');
language.enter((ctx) => {
    console.log("[INFO] - Choosing language");
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
        ctx.editMessageText("Tria idioma / Selecciona idioma");
        ctx.i18n.locale('es');
        if (!isTimeToClose()) {
            ctx.scene.enter('greeter');
        } else {
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
            ctx.scene.enter('closed');
        }

    } else if (answer === 'va') {
        ctx.answerCbQuery("Valencià");
        ctx.i18n.locale('va');
        if (!isTimeToClose()) {
            ctx.scene.enter('greeter');
        } else {
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
            ctx.scene.enter('closed');
        }
    }

});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Greeting user Scene
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const greeter = new Scene('greeter');
greeter.enter((ctx) => {
    console.log("[INFO] - Greeter scene");
    ctx.reply(Emoji.emojify(ctx.i18n.t('greeting'))).then(function () {
        if (!isTimeToClose()) {
            ctx.scene.enter('email');
        } else {
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
            ctx.scene.enter('closed');
        }
    });
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Recieving and filtering email Scene
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const email = new Scene('email');
email.on('message', (ctx) => {
    console.log("[INFO] - Email scene");
    if (ctx.message.text && EmailValidator.validate(ctx.message.text)) {
        ctx.scene.enter('verifyEmail');
        ctx.session.emailRaw = ctx.message.text.toLowerCase();
    } else {
        console.log("[INFO] - Wrong email format");
        ctx.reply(Emoji.emojify(ctx.i18n.t('unexpectedEmail')));
    }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Confirm and verifying email Scene
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const verifyEmail = new Scene('verifyEmail');
verifyEmail.enter((ctx) => {
    console.log("[INFO] - Verify email scene");
    ctx.reply(Emoji.emojify(ctx.i18n.t('emailVerify', {
        email_verify: ctx.session.emailRaw
    })), Extra.HTML().markup((m) =>
        m.inlineKeyboard([
            m.callbackButton('Sí', 'email_verify_yes'),
            m.callbackButton('No', 'email_verify_no')
        ])))
});

verifyEmail.on('callback_query', ctx => {

    ctx.editMessageText(Emoji.emojify(ctx.i18n.t('emailVerify', {
        email_verify: ctx.session.emailRaw
    })));


    let answer = ctx.callbackQuery.data;
    if (answer === 'email_verify_yes') {
        ctx.answerCbQuery("Si");

        let domain = ctx.session.emailRaw.replace(/.*@/, "");
        let emailAdd = Addrs.parseOneAddress(ctx.session.emailRaw);
        let emailUser = emailAdd.local;
        let parsedDomain = parseDomain(domain);
        let verifyDomain = parseDomain(process.env.VERIFY_DOMAIN);

        let cypEmail = CryptoJS.SHA3(ctx.session.emailRaw);
        let cypEmailUser = CryptoJS.SHA3(emailUser);

        if (_.isEqual(parsedDomain.domain, verifyDomain.domain) && _.isEqual(parsedDomain.tld, verifyDomain.tld)) {
            //Proceed. Email is domain verified.
            ctx.reply(Emoji.emojify(ctx.i18n.t('emailCorrect')));
            ctx.session.voterType = 0;
            ctx.session.email = cypEmail.toString();
            ctx.session.emailUser = cypEmailUser.toString();
            ctx.session.passwordCount = 0;
            ctx.session.password = generator.generate({
                length: 4,
                numbers: true,
                uppercase: false,
                excludeSimilarCharacters: true,
                exclude: 'abcdefghijklmnopqrstuvwxyz'

            });

            sendEmail(ctx, password).then(function (ko, ok) {
                if (ko) {
                    console.error("ERR sending password email");
                } else {
                    if (!isTimeToClose()) {
                        ctx.scene.enter('password');
                    } else {
                        ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
                        ctx.scene.enter('closed');
                    }
                }

            })

        } else {
            //External email voter
            let query = {
                TableName: "voter_email",
                Key: {
                    'user': {"S": cypEmail.toString()},
                }
            };
            db.getItem(query, function (err, data) {
                if (err) {
                    console.error("[INFO] - Email unable to query. Error:", JSON.stringify(err, null, 2));
                } else if (data.Item) {
                    console.log("[INFO] - External email found... ");
                    ctx.reply(Emoji.emojify(ctx.i18n.t('emailCorrect')));

                    ctx.session.email = cypEmail.toString();
                    ctx.session.emailUser = cypEmailUser.toString();
                    ctx.session.passwordCount = 0;
                    ctx.session.voterType = 1;
                    ctx.session.password = generator.generate({
                        length: 4,
                        numbers: true,
                        uppercase: false,
                        excludeSimilarCharacters: true,
                        exclude: 'abcdefghijklmnopqrstuvwxyz'

                    });

                    sendEmail(ctx).then(function (ko, ok) {
                        if (ko) {
                            console.error("ERR");
                        } else {
                            if (!isTimeToClose()) {
                                ctx.scene.enter('password');
                            } else {
                                ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
                                ctx.scene.enter('closed');
                            }
                        }
                    })

                } else {
                    //Email is not UPV nor authorised. Error and block.
                    ctx.reply(Emoji.emojify(ctx.i18n.t('emailNotCorrect')));
                    ctx.scene.enter('blockedEmail');
                }
            })
        }
    } else if (answer === 'email_verify_no') {
        ctx.answerCbQuery("No");
        ctx.reply(Emoji.emojify(ctx.i18n.t('emailVerifyNo')));
        ctx.scene.enter('email');
    }
});


verifyEmail.on('message', (ctx) => {
    ctx.reply(Emoji.emojify(ctx.i18n.t('unexpectedVote')))
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Receiving and checking password Scene
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const password = new Scene('password');
password.on('message', (ctx) => {
    console.log("[INFO] - Expecting password scene");
    ctx.session.passwordCount = ctx.session.passwordCount + 1;
    if (ctx.session.passwordCount < 4) {
        if (_.isEqual(ctx.session.password, ctx.message.text)) {
            ctx.reply(ctx.i18n.t('passwordCorrect')).then(function () {
                if (!isTimeToClose()) {
                    ctx.scene.enter('vote1');
                } else {
                    ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
                    ctx.scene.enter('closed');
                }
            })
        } else {
            ctx.reply(ctx.i18n.t('passwordNotCorrect'));
        }
    } else {
        ctx.reply(ctx.i18n.t('tooManyAttempts'))
    }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// First question to vote Scene
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const vote1 = new Scene('vote1');
vote1.enter((ctx) => {
    ctx.reply(ctx.i18n.t('vote1'), Extra.HTML().markup((m) =>
        m.inlineKeyboard([
            m.callbackButton('Sí', 'yes_vote1'),
            m.callbackButton('No', 'no_vote1'),
            m.callbackButton(ctx.i18n.t('abs'), 'abs_vote1')
        ])))
});


vote1.on('callback_query', ctx => {
    console.log("[INFO] - Vote1 recieved");
    ctx.session.vote1 = null;
    ctx.editMessageText(ctx.i18n.t('vote1'));
    if (_.isEqual("yes_vote1", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("Sí");
        if (!isTimeToClose()) {
            ctx.session.vote1 = "Sí";
            ctx.scene.enter('vote2');
        } else {
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
            ctx.scene.enter('closed');
        }

    } else if (_.isEqual("no_vote1", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("No");
        if (!isTimeToClose()) {
            ctx.session.vote1 = "No";
            ctx.scene.enter('verify');
        } else {
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
            ctx.scene.enter('closed');
        }

    } else if (_.isEqual("abs_vote1", ctx.callbackQuery.data)) {
        ctx.answerCbQuery(ctx.i18n.t('abs'));
        if (!isTimeToClose()) {
            ctx.session.vote1 = "Abstención";
            ctx.scene.enter('verify');
        } else {
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
            ctx.scene.enter('closed');

        }
    } else {
        ctx.reply(Emoji.emojify(ctx.i18n.t('unexpectedVote')));
    }

});

vote1.on('message', (ctx) => {
    ctx.reply(Emoji.emojify(ctx.i18n.t('unexpectedVote')))
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Second question to vote Scene
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const vote2 = new Scene('vote2');
vote2.enter((ctx) => {
    ctx.reply(ctx.i18n.t('vote2'), Extra.HTML().markup((m) =>
        m.inlineKeyboard([
            m.callbackButton('Sí', 'yes_vote2'),
            m.callbackButton('No', 'no_vote2'),
            m.callbackButton(ctx.i18n.t('abs'), 'abs_vote2')
        ])))
});


vote2.on('callback_query', ctx => {
    console.log("[INFO] - Vote2 recieved");
    ctx.session.vote2 = null;
    ctx.editMessageText(ctx.i18n.t('vote2'));
    if (_.isEqual("yes_vote2", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("Sí");
        if (!isTimeToClose()) {
            ctx.session.vote2 = "Sí";
            ctx.scene.enter('verify');
        } else {
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
            ctx.scene.enter('closed');
        }

    } else if (_.isEqual("no_vote2", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("No");
        if (!isTimeToClose()) {
            ctx.session.vote2 = "No";
            ctx.scene.enter('verify');
        } else {
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
            ctx.scene.enter('closed');
        }

    } else if (_.isEqual("abs_vote2", ctx.callbackQuery.data)) {
        ctx.answerCbQuery(ctx.i18n.t('abs'));
        if (!isTimeToClose()) {
            ctx.session.vote2 = "Abstención";
            ctx.scene.enter('verify');
        } else {
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
            ctx.scene.enter('closed');
        }
    } else {
        ctx.reply(Emoji.emojify(ctx.i18n.t('unexpectedVote')));
    }

});

vote2.on('message', (ctx) => {
    ctx.reply(Emoji.emojify(ctx.i18n.t('unexpectedVote')))
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Confirm vote to be stored Scene
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
            m.callbackButton('Sí', 'si_verify'),
            m.callbackButton('No', 'no_verify')
        ])))
});


verify.on('callback_query', ctx => {
    console.log("[INFO] - Verifying");
    let answer = "";
    if (!ctx.session.vote2) {
        answer = 'verify1'
    } else {
        answer = 'verify'
    }
    ctx.editMessageText(Emoji.emojify(ctx.i18n.t(answer, {
        vote1: ctx.session.vote1,
        vote2: ctx.session.vote2
    })));

    if (_.isEqual("si_verify", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("Sí");



        //----------------------------VOTER TYPE 0 - UNI----------------------------
        if (ctx.session.voterType === 0) {
            console.log("[INFO] - Verify, voter type 0");


            let query = {
                TableName: "voter_email",
                Key: {
                    'user': {"S": ctx.session.emailUser},
                }
            };

            db.getItem(query, function (err, data) {
                if (err) {
                    console.error("[INFO] - Email unable to query. Error:", JSON.stringify(err, null, 2));
                } else if (data.Item) {
                    console.log("[INFO] - Domain verified email found... ");
                    if (data.Item.has_voted && data.Item.has_voted.N == 1) {
                        //User has voted
                        ctx.reply(Emoji.emojify(ctx.i18n.t('hasVoted')));
                        if (!isTimeToClose()) {
                            ctx.scene.enter('voted');
                        } else {
                            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
                            ctx.scene.enter('closed');
                        }
                    } else {
                        //User has not voted
                        console.log("[INFO] - UNI User found but has not voted, registering...");

                        let storeVote = {
                            TableName: 'votes',
                            Item: {
                                "id": uuidv1(),
                                "question1": ctx.session.vote1,
                                "question2": ctx.session.vote2
                            }
                        };
                        docClient.put(storeVote, function (err, data) {
                            if (err) {
                                console.error("Unable to add vote. Error JSON:", JSON.stringify(err, null, 2));
                            } else {
                                sendVoteToAuthorities(ctx).then(function(ko, ok){
                                    if(ko){
                                        console.error("ERROR while trying to send email to authorities")
                                    }else {
                                        let item = {
                                            TableName: 'voter_email',
                                            Item: {
                                                "user": ctx.session.emailUser,
                                                "has_voted": 1
                                            }
                                        };
                                        console.log("[INFO] - Registering voter");
                                        docClient.put(item, function (err, data) {
                                            if (err) {
                                                console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
                                            } else {
                                                ctx.session.emailRaw = null;
                                                ctx.session.password = null;
                                                ctx.session.vote1 = null;
                                                ctx.session.vote2 = null;
                                                ctx.reply(ctx.i18n.t('thanks'));
                                                ctx.scene.enter('voted')

                                            }
                                        });
                                    }

                                });


                            }
                        });

                    }

                } else {
                    //No email found, creating record.
                    //User has not voted
                    console.log("[INFO] - UNI User not found, registering...");
                    let storeVote = {
                        TableName: 'votes',
                        Item: {
                            "id": uuidv1(),
                            "question1": ctx.session.vote1,
                            "question2": ctx.session.vote2
                        }
                    };
                    docClient.put(storeVote, function (err, data) {
                        if (err) {
                            console.error("Unable to add vote. Error JSON:", JSON.stringify(err, null, 2));
                        }else{
                            sendVoteToAuthorities(ctx).then(function(ko, ok){
                                if(ko){
                                    console.error("ERROR while trying to send email to authorities")
                                }else {

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
                                            ctx.session.emailRaw = null;
                                            ctx.session.password = null;
                                            ctx.session.vote1 = null;
                                            ctx.session.vote2 = null;
                                            ctx.reply(ctx.i18n.t('thanks'));
                                            ctx.scene.enter('voted')

                                        }
                                    });

                                }

                            })
                        }
                    });
                }
            });




        //----------------------------VOTER TYPE 1 NON UNI----------------------------
        } else if (ctx.session.voterType === 1) {
            console.log("[INFO] - Verify, voter type 1");



            let query = {
                TableName: "voter_email",
                Key: {
                    'user': {"S": ctx.session.email},
                }
            };
            db.getItem(query, function (err, data) {
                if (err) {
                    console.error("[INFO] - Email unable to query. Error:", JSON.stringify(err, null, 2));
                } else if (data.Item) {
                    if (data.Item.has_voted && data.Item.has_voted.N == 1) {
                        //User has voted
                        ctx.reply(Emoji.emojify(ctx.i18n.t('hasVoted')));
                        ctx.scene.enter('voted');

                    } else {
                        //User has not voted
                        console.log("[INFO] - EXT User found and has not voted, registering...");
                        let storeVote = {
                            TableName: 'votes',
                            Item: {
                                "id": uuidv1(),
                                "question1": ctx.session.vote1,
                                "question2": ctx.session.vote2
                            }
                        };
                        docClient.put(storeVote, function (err, data) {
                            if (err) {
                                console.error("Unable to add vote. Error JSON:", JSON.stringify(err, null, 2));
                            }else{
                                sendVoteToAuthorities(ctx).then(function(ko, ok) {
                                    if (ko) {
                                        console.error("ERROR while trying to send email to authorities")
                                    }else{
                                        let item = {
                                            TableName: 'voter_email',
                                            Key: {
                                                'user': ctx.session.email
                                            },
                                            UpdateExpression: "set has_voted = :hv",
                                            ExpressionAttributeValues: {
                                                ":hv": 1
                                            },
                                            ReturnValues: "UPDATED_NEW"
                                        };

                                        console.log("Updating the item...");
                                        docClient.update(item, function (err, data) {
                                            if (err) {
                                                console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
                                            } else {
                                                console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
                                                ctx.session.emailRaw = null;
                                                ctx.session.password = null;
                                                ctx.session.vote1 = null;
                                                ctx.session.vote2 = null;
                                                ctx.reply(ctx.i18n.t('thanks'));
                                                ctx.scene.enter('voted');
                                            }
                                        });

                                    }
                                })
                            }
                        });
                    }

                }

            });
        }

    } else if (_.isEqual("no_verify", ctx.callbackQuery.data)) {
        ctx.answerCbQuery("No");
        ctx.session.vote1 = null;
        ctx.session.vote2 = null;
        if (!isTimeToClose()) {
            ctx.scene.enter('vote1')
        } else {
            ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
            ctx.scene.enter('closed');
        }
    } else {
        ctx.reply(Emoji.emojify(ctx.i18n.t('unexpectedVote')))
    }

});

verify.command('start', (ctx) => {
    ctx.reply(Emoji.emojify(ctx.i18n.t('thanks')))
});

verify.on('message', (ctx) => {
    ctx.reply(Emoji.emojify(ctx.i18n.t('unexpectedVote')))
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Blocked because unallowed email Scene
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const blockedEmail = new Scene('blockedEmail');
blockedEmail.on('message', (ctx) => {
    ctx.reply(Emoji.emojify(ctx.i18n.t('emailNotCorrect')));

});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// User has voted Scene
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const voted = new Scene('voted');
voted.on('message', (ctx) => {
    ctx.reply(Emoji.emojify(ctx.i18n.t('thanks')));

});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Voting is closed Scene
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const closed = new Scene('closed');
closed.on('message', (ctx) => {
    ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));

});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//####################################################################################################################//
//--------------------------------------------------------------------------------------------------------------------//
const stage = new Stage();



//Results handler
stage.command('resultados', (ctx) => {
    if (isTimeToClose()) {
        ctx.reply(Emoji.emojify(ctx.i18n.t('results')));
    } else {
        ctx.reply(Emoji.emojify(ctx.i18n.t('resultsNot')));
    }
});


// Scene registration
stage.register(language);
stage.register(greeter);
stage.register(verifyEmail);
stage.register(email);
stage.register(password);
stage.register(vote1);
stage.register(vote2);
stage.register(verify);
stage.register(voted);
stage.register(blockedEmail);
stage.register(closed);


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

bot.use((new LocalSession({database: 'session_db.json'})));
bot.use(i18n.middleware());
bot.use(stage.middleware());

console.log("[INFO] - Init...");

bot.command('start', (ctx) => {
    if (!isTimeToClose()) {
        ctx.scene.enter('language')
    } else {
        ctx.reply(Emoji.emojify(ctx.i18n.t('closed')));
        ctx.scene.enter('closed')
    }
});


bot.startPolling();
//--------------------------------------------------------------------------------------------------------------------//
//####################################################################################################################//


//Sends an emails with the code to the voter
function sendEmail(ctx) {
    return new Promise(function (resolve, reject) {

        let params = {
            Destination: {
                ToAddresses: [ctx.session.emailRaw],
                BccAddresses: [process.env.GDPR_BCC]
            },
            Message: {
                Body: {
                    Text: {
                        Charset: "UTF-8",
                        //TODO: Add GDPR footer
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
                console.log("[INFO] - Email sent correctly: " + data.MessageId);
                return resolve();
            }).catch(
            function (err) {
                console.error("[ERROR] - Email error:" + err, err.stack);
                return reject(err);
            });

    })
}

//Sends an email to the authorities with the vote
function sendVoteToAuthorities(ctx) {
    let emails = process.env.AUTHORITY_EMAIL.split(',');
    return new Promise(function (resolve, reject) {

        let params = {
            Destination: {
                ToAddresses: emails
            },
            Message: {
                Body: {
                    Text: {
                        Charset: "UTF-8",
                        Data: "Respuesta pregunta 1 - " + ctx.session.vote1 + "\n" +
                            "Respuesta pregunta 2 - " + ctx.session.vote2
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
                console.log("[INFO] - Email sent correctly: " + data.MessageId);
                return resolve();
            }).catch(
            function (err) {
                console.error("[ERROR] - Email error:" + err, err.stack);
                return reject();
            });

    })
}


function isTimeToClose() {
    let now = Moment().local();
    //console.log("NOW:" + now.toString());
    //console.log("END DATE: "+EndDate.toString());
    return now.isAfter(EndDate)
}
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

let GresultsGenerated = false;
let GtotalVotes = null;
let Gq1Yes = null;
let Gq1No = null;
let Gq1Abs = null;
let Gq2Yes = null;
let Gq2No = null;
let Gq2Abs = null;

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
            ctx.session.emailCount = 0;
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
                    console.log(ctx.session.emailCount)
                    ctx.session.emailCount = ctx.session.emailCount + 1;
                    if(ctx.session.emailCount < 4){
                        ctx.reply(Emoji.emojify(ctx.i18n.t('emailNotCorrect')));
                        ctx.scene.enter('email');
                    }else{
                        ctx.reply(Emoji.emojify(ctx.i18n.t('tooManyAttempts')));
                        ctx.scene.enter('blockedEmail');
                    }
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
                                sendVoteToAuthorities(ctx).then(function (ko, ok) {
                                    if (ko) {
                                        console.error("ERROR while trying to send email to authorities")
                                    } else {
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
                        } else {
                            sendVoteToAuthorities(ctx).then(function (ko, ok) {
                                if (ko) {
                                    console.error("ERROR while trying to send email to authorities")
                                } else {

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
                            } else {
                                sendVoteToAuthorities(ctx).then(function (ko, ok) {
                                    if (ko) {
                                        console.error("ERROR while trying to send email to authorities")
                                    } else {
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
    ctx.reply(Emoji.emojify(ctx.i18n.t('tooManyAttempts')));

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
        if(GresultsGenerated){
            ctx.reply(Emoji.emojify(ctx.i18n.t('results', {
                total_voters: GtotalVotes,
                q1Yes: Gq1Yes,
                q1No: Gq1No,
                q1Abs: Gq1Abs,
                q2Yes: Gq2Yes,
                q2No: Gq2No,
                q2Abs: Gq2Abs
            })));
        }else{
            generateResults().then(function(ko, ok){
                if(ko){
                    console.error("ERROR generating results");
                }else{
                    ctx.reply(Emoji.emojify(ctx.i18n.t('results', {
                        total_voters: GtotalVotes,
                        q1Yes: Gq1Yes,
                        q1No: Gq1No,
                        q1Abs: Gq1Abs,
                        q2Yes: Gq2Yes,
                        q2No: Gq2No,
                        q2Abs: Gq2Abs
                    })));
                }
            })
        }

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
                        Data: ctx.i18n.t('emailBody') + ctx.session.password +"\n\n\n" +
                            "---------------------------------------------------------------\n"+
                            "Políticas de Privacidad “Consulta Modelo de Estado en la UPV”\n" +
                            "\n" +
                            "1.-Tratamos tus datos.\n" +
                            "Somos una plataforma integrada por alumnado, profesorado y personal de administración y servicios de la Universitat Politècnica de València, que participan a título individual como miembros de la comunidad universitaria para convocar una consulta de opinión sobre el modelo de estado en España. Nuestros datos de contacto son: Plataforma pel referèndum a la UPV (consultamodelestatalaupv@evotebox.es).\n" +
                            "2. ¿Para qué tratamos sus datos?\n" +
                            "Tratamos tus datos para convocar una consulta de opinión sobre el modelo de estado en España. Hemos diseñado un sistema que funciona para que puedas votar garantizando un voto individual, libre y secreto.\n" +
                            "3. Como vas a votar.\n" +
                            "La consulta se realizará a través de la plataforma Telegram mediante un bot (consultamodelestatalaUPVbot). Para participar en la consulta se utilizará tu dirección de correo electrónico de la UPV para comprobar que eres miembro de la comunidad universitaria y que se cumple el principio “una persona un voto”. Para ello, te enviaremos un número de cuatro cifras que deberás introducir en el bot. Una vez validado el número el sistema te planteará la primera pregunta (“¿Estás a favor de cambiar la monarquía por una república como forma de Estado?”) y te ofrecerá tres posibles respuestas (“Sí”, “No”, “Abstención”). En caso de contestar afirmativamente, el bot te planteará una segunda pregunta (“¿Estás a favor de abrir procesos constituyentes para decidir qué tipo de república?”) ofreciéndote las mismas opciones de respuesta. Antes de proceder a registrar las respuestas el bot te pedirá que las valides. A partir de ahí, el sistema almacenará de forma encriptada tu dirección de correo para proteger tus datos personales en la nube y almacenará tus respuestas separadamente para garantizar el voto anónimo.\n" +
                            "Para aquellas personas que trabajan en la UPV y no son personal de la universidad se ha habilitado un mecanismo para que puedan participar de la consulta en igualdad de condiciones que el resto de miembros de la comunidad universitaria. Para ello, deberán proporcionar su NIF y una cuenta personal de correo electrónico. A partir de ahí, el procedimiento de voto es el mismo que para el resto de miembros de la comunidad universitaria. Tanto el NIF como la dirección de correo electrónico se almacenan de forma encriptada y las respuestas se registrarán de forma anónima.\n" +
                            "De esta forma, nuestro procedimiento asegura que sólo puedan votar las personas con derecho a ello con las debidas medidas de seguridad.\n" +
                            "3. Con qué base tratamos tus datos.\n" +
                            "Únicamente tratamos tus datos de identificación, cuenta de correo electrónico o NIF, para que puedas usar nuestro bot para participar. Que usemos tus datos depende de que manifiestes tu consentimiento al aceptar el inicio del procedimiento de voto en nuestro bot.\n" +
                            "4. Destinatarios de tus datos.\n" +
                            "No cedemos tus datos a ningún tercero. Nuestros sistemas están alojados en un proveedor de servicios con las garantías del Reglamento General de Protección de Datos (Amazon Web Services con tratamiento en Irlanda). Amazon Web Services dispone de la certificación ISO 27018 (https://d1.awsstatic.com/certifications/iso_27018_certification.pdf). La norma ISO 27018 (https://www.iso.org/standard/61498.html) es un código de conducta diseñado para proteger datos personales en la nube. Se basa en la norma sobre seguridad de la información 27002 y proporciona asesoramiento en materia de implementación en lo referente a los controles de la norma 27002 aplicables a la información personalmente identificable (PII). Además, proporciona un conjunto de controles adicionales y asesoramiento relacionado a fin de satisfacer los requisitos de protección de la información personalmente identificable en la nube no cubiertos por el conjunto de controles existentes de la norma ISO 27002.\n" +
                            "5. Cancelación de tus datos.\n" +
                            "Una vez finalizado el proceso no usaremos más tus datos. La Ley española de protección de datos obliga a mantenerlos bloqueados durante tres años para verificar nuestra responsabilidad por los tratamientos. En ese periodo, no estarán accesibles a ningún usuario y no será tratados, salvo por el administrador para facilitarlos si le fueran requeridos.\n" +
                            "6. Qué derechos tienes.\n" +
                            "Puedes ejercer tus derechos de acceso, rectificación, supresión, portabilidad, limitación u oposición al tratamiento escribiéndonos al correo electrónico (consultamodelestatalaupv_rgpd@evotebox.es) desde una cuenta de la UPV o indicando tu NIF si eres personal de empresas prestadoras de servicios a la Universitat Politècnica de València.\n" +
                            "7. Ante quién puedo reclamar.\n" +
                            "En caso de que desees presentar una reclamación u obtener información adicional sobre la regulación del tratamiento de datos personales en España, la autoridad competente es la Agencia Española de Protección de Datos (Jorge Juan, 6 28001-Madrid)."
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
    console.log("--------------------------------------------------");
    console.log("   --NOW     : " + now.toString());
    console.log("   --END DATE: "+EndDate.toString());
    console.log("--------------------------------------------------");
    return now.isAfter(EndDate)
}


function generateResults(){
    return new Promise(function (resolve, reject) {
        let allItems = {
            TableName: "votes"
        };


        let respQ1yes = {
            TableName: "votes",
            FilterExpression: "question1 = :a",
            ExpressionAttributeValues: {
                ":a": "Sí"
            }
        };

        let respQ1no = {
            TableName: "votes",
            FilterExpression: "question1 = :a",
            ExpressionAttributeValues: {
                ":a": "No"
            }
        };

        let respQ1abs = {
            TableName: "votes",
            FilterExpression: "question1 = :a",
            ExpressionAttributeValues: {
                ":a": "Abstención"
            }
        };


        let respQ2yes = {
            TableName: "votes",
            FilterExpression: "question2 = :a",
            ExpressionAttributeValues: {
                ":a": "Sí"
            }
        };

        let respQ2no = {
            TableName: "votes",
            FilterExpression: "question2 = :a",
            ExpressionAttributeValues: {
                ":a": "No"
            }
        };

        let respQ2abs = {
            TableName: "votes",
            FilterExpression: "question2 = :a",
            ExpressionAttributeValues: {
                ":a": "Abstención"
            }
        };


        docClient.scan(allItems, function onScan(err, data) {
            if (err) {
                console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                reject()
            } else {
                let totalVotes = data.Count;

                docClient.scan(respQ1yes, function onScan(err, data) {
                    if (err) {
                        console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                        reject()
                    } else {
                        let q1Yes = data.Count;

                        docClient.scan(respQ1no, function onScan(err, data) {
                            if (err) {
                                console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                                reject()
                            } else {
                                let q1No = data.Count;

                                docClient.scan(respQ1abs, function onScan(err, data) {
                                    if (err) {
                                        console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                                        reject()
                                    } else {
                                        let q1Abs = data.Count;

                                        docClient.scan(respQ2yes, function onScan(err, data) {
                                            if (err) {
                                                console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                                                reject()
                                            } else {
                                                let q2Yes = data.Count;

                                                docClient.scan(respQ2no, function onScan(err, data) {
                                                    if (err) {
                                                        console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                                                        reject()
                                                    } else {
                                                        let q2No = data.Count;

                                                        docClient.scan(respQ2abs, function onScan(err, data) {
                                                            if (err) {
                                                                console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
                                                                reject()
                                                            } else {
                                                                let q2Abs = data.Count;

                                                                GresultsGenerated = true;
                                                                GtotalVotes = totalVotes;
                                                                Gq1Yes = q1Yes;
                                                                Gq1No = q1No;
                                                                Gq1Abs = q1Abs;
                                                                Gq2Yes = q2Yes;
                                                                Gq2No = q2No;
                                                                Gq2Abs = q2Abs;
                                                                resolve()
                                                            }
                                                        });
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });

    });

}
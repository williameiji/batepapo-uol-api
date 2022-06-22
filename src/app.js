import express from "express";
import cors from "cors";
import Joi from "joi";
import dayjs from "dayjs";
import { MongoClient, ObjectId } from "mongodb";
import { strict as assert } from "assert";
import { stripHtml } from "string-strip-html";
import dotenv from "dotenv";
dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

const mongoClient = new MongoClient(process.env.MONGO_URL);
let db;

mongoClient.connect().then(() => {
	db = mongoClient.db("batepapo_uol");
});

const schema = Joi.object({
	name: Joi.string().alphanum().min(1),

	to: Joi.string().min(1),

	text: Joi.string().min(1),

	type: Joi.any().valid("message", "private_message"),
});

app.post("/participants", (req, res) => {
	const { name } = req.body;

	const { error } = schema.validate({ name });

	if (error) {
		res.sendStatus(422);
		return;
	}

	db.collection("users")
		.findOne({
			name: name,
		})
		.then((user) => {
			if (user) {
				res.sendStatus(409);
				return;
			}
		});

	db.collection("users").insertOne({
		name: name,
		lastStatus: Date.now(),
	});

	db.collection("messages")
		.insertOne({
			from: name,
			to: "Todos",
			text: "entra na sala...",
			type: "status",
			time: dayjs(new Date()).format("HH:mm:ss"),
		})
		.then(() => {
			res.sendStatus(201);
		});
});

app.get("/participants", (req, res) => {
	db.collection("users")
		.find()
		.toArray()
		.then((allParticipants) => {
			res.send(allParticipants);
		});
});

app.post("/messages", (req, res) => {
	const { to, text, type } = req.body;
	const { user } = req.headers;
	const { error } = schema.validate({ to, text, type });

	const isParticipantOnline = db.collection("users").findOne({ name: user });

	if (error || !isParticipantOnline) {
		res.sendStatus(422);
		return;
	}

	db.collection("messages")
		.insertOne({
			from: user,
			to,
			text,
			type,
			time: dayjs(new Date()).format("HH:mm:ss"),
		})
		.then(() => {
			res.sendStatus(201);
		});
});

app.get("/messages", (req, res) => {
	const limit = req.query.limit;
	const user = req.headers.user;
	const start = limit * -1;

	db.collection("messages")
		.find()
		.toArray()
		.then((allMessages) => {
			const filteredMessages = allMessages.filter(
				(msg) => msg.to === "Todos" || msg.to === user || msg.from === user
			);
			if (filteredMessages.length > limit) {
				const sendMessages = filteredMessages.slice(
					start,
					filteredMessages.length
				);

				res.send(sendMessages);
				return;
			}

			res.send(filteredMessages);
		});
});

app.delete("/messages/:idMessage", (req, res) => {
	const id = req.params.idMessage;
	const { user } = req.headers;

	db.collection("messages")
		.findOne({ _id: ObjectId(`${id}`), from: user })
		.then((MessageToDelete) => {
			if (user !== MessageToDelete.from) {
				res.sendStatus(401);
				return;
			}

			db.collection("messages").deleteOne(MessageToDelete);
		})
		.catch(() => {
			res.sendStatus(404);
		});
});

app.post("/status", (req, res) => {
	const user = req.headers.user;

	db.collection("users")
		.replaceOne({ name: user }, { name: user, lastStatus: Date.now() })
		.then(() => {
			res.sendStatus(200);
		})
		.catch(() => {
			res.sendStatus(404);
		});
});

function removeInactiveUser(user) {
	const time = Date.now() - 5000;
	if (user.lastStatus < time) {
		return user;
	}
}

setInterval(() => {
	db.collection("users")
		.find()
		.toArray()
		.then((allUsers) => {
			const inactiveUser = allUsers
				.map((part) => part)
				.filter(removeInactiveUser);

			inactiveUser.forEach((item) => {
				let searchUser = allUsers.find((a) => a === item);

				db.collection("messages").insertOne({
					from: item.name,
					to: "Todos",
					text: "sai da sala...",
					type: "status",
					time: dayjs(new Date()).format("HH:mm:ss"),
				});

				db.collection("users").deleteOne(searchUser);
			});
		});
}, 15000);

app.listen(process.env.PORT);

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");

const app = express();
app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "recipe_app_db";

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/api/recipes', async (req, res) => {
	let client;
	try {
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		const recipesCollection = db.collection('recipes');

		const { userId, name, ingredients, instructions, prepTime, cookTime, servings, cuisineType, difficulty, imageUrl } = req.body;

		if (!userId || !name || !ingredients || !instructions) {
			return res.status(400).send({ message: 'Missing required fields: userId, name, ingredients, instructions' });
		}

		const newRecipe = {
			userId,
			name,
			ingredients,
			instructions,
			prepTime: prepTime || '',
			cookTime: cookTime || '',
			servings: servings || '',
			cuisineType: cuisineType || '',
			difficulty: difficulty || '',
			imageUrl: imageUrl || '',
			createdAt: new Date(),
			updatedAt: new Date()
		};

		const result = await recipesCollection.insertOne(newRecipe);
		res.status(201).send({ message: 'Recipe added successfully!', recipeId: result.insertedId });
	} catch (error) {
		console.error("Error adding recipe:", error);
		res.status(500).send({ message: 'Failed to add recipe', error: error.message });
	} finally {
		if (client) await client.close();
	}
});

app.get('/api/recipes/public', async (req, res) => {
	let client;
	try {
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		const recipesCollection = db.collection('recipes');

		const publicRecipes = await recipesCollection.find({}).toArray();
		res.status(200).send(publicRecipes);
	} catch (error) {
		console.error("Error fetching public recipes:", error);
		res.status(500).send({ message: 'Failed to fetch public recipes', error: error.message });
	} finally {
		if (client) await client.close();
	}
});

app.get('/api/recipes/user/:userId', async (req, res) => {
	let client;
	try {
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		const recipesCollection = db.collection('recipes');

		const userId = req.params.userId;
		if (!userId) {
			return res.status(400).send({ message: 'User ID is required' });
		}

		const userRecipes = await recipesCollection.find({ userId: userId }).toArray();
		res.status(200).send(userRecipes);
	} catch (error) {
		console.error("Error fetching user recipes:", error);
		res.status(500).send({ message: 'Failed to fetch user recipes', error: error.message });
	} finally {
		if (client) await client.close();
	}
});

app.put('/api/recipes/:id', async (req, res) => {
	let client;
	try {
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		const recipesCollection = db.collection('recipes');

		const recipeId = req.params.id;
		const { userId, ...updateData } = req.body;

		if (!ObjectId.isValid(recipeId)) {
			return res.status(400).send({ message: 'Invalid Recipe ID format' });
		}

		const existingRecipe = await recipesCollection.findOne({ _id: new ObjectId(recipeId) });
		if (!existingRecipe) {
			return res.status(404).send({ message: 'Recipe not found' });
		}
		if (existingRecipe.userId !== userId) {
			return res.status(403).send({ message: 'Unauthorized: You can only update your own recipes.' });
		}

		const result = await recipesCollection.updateOne(
			{ _id: new ObjectId(recipeId) },
			{ $set: { ...updateData, updatedAt: new Date() } }
		);

		if (result.matchedCount === 0) {
			return res.status(404).send({ message: 'Recipe not found or no changes made' });
		}
		res.status(200).send({ message: 'Recipe updated successfully!' });
	} catch (error) {
		console.error("Error updating recipe:", error);
		res.status(500).send({ message: 'Failed to update recipe', error: error.message });
	} finally {
		if (client) await client.close();
	}
});

app.delete('/api/recipes/:id', async (req, res) => {
	let client;
	try {
		client = new MongoClient(MONGODB_URI);
		await client.connect();
		const db = client.db(DB_NAME);
		const recipesCollection = db.collection('recipes');

		const recipeId = req.params.id;
		const { userId } = req.body;

		if (!ObjectId.isValid(recipeId)) {
			return res.status(400).send({ message: 'Invalid Recipe ID format' });
		}

		const existingRecipe = await recipesCollection.findOne({ _id: new ObjectId(recipeId) });
		if (!existingRecipe) {
			return res.status(404).send({ message: 'Recipe not found' });
		}
		if (existingRecipe.userId !== userId) {
			return res.status(403).send({ message: 'Unauthorized: You can only delete your own recipes.' });
		}

		const result = await recipesCollection.deleteOne({ _id: new ObjectId(recipeId) });

		if (result.deletedCount === 0) {
			return res.status(404).send({ message: 'Recipe not found' });
		}
		res.status(200).send({ message: 'Recipe deleted successfully!' });
	} catch (error) {
		console.error("Error deleting recipe:", error);
		res.status(500).send({ message: 'Failed to delete recipe', error: error.message });
	} finally {
		if (client) await client.close();
	}
});

app.post('/api/upload-image', upload.single('image'), async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).send({ message: 'No image file provided' });
		}

		const uploadResult = await cloudinary.uploader.upload(
			`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
			{
				folder: 'recipe_images',
			}
		);

		res.status(200).send({ imageUrl: uploadResult.secure_url, publicId: uploadResult.public_id });
	} catch (error) {
		console.error("Cloudinary upload error:", error);
		res.status(500).send({ message: 'Image upload failed', error: error.message });
	}
});

app.get("/", (req, res) => {
	res.send("Recipe App Backend is Running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
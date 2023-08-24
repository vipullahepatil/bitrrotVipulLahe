import express from 'express';
import csv from 'fast-csv';
import multer from 'multer';
// import { createObjectCsvWriter as csv } from 'csv-writer';
import cors from 'cors';
import db from './db.js'; // Database connection module
import fs from 'fs';

const app = express();
app.use(cors())
app.use(express.json());
 


app.post('/contacts', async (req, res) => {
  try {
    // Extract contact data from request body
    const { name, email, phoneNumbers } = req.body;

    // Check for duplicate phone numbers
    const duplicatePhoneNumbers = await Promise.all(
      phoneNumbers.map(async phoneNumber => {
        try {
          const duplicateCheckQuery = 'SELECT COUNT(*) as count FROM phone_numbers WHERE phone_number = ?';
          const [duplicateCheckResult] = await db.execute(duplicateCheckQuery, [phoneNumber]);
          return duplicateCheckResult[0].count > 0;
        } catch (error) {
          console.error(error);
          throw new Error('Error while checking duplicate phone numbers');
        }
      })
    );

    // If any duplicate phone numbers are found, return an error response
    if (duplicatePhoneNumbers.some(isDuplicate => isDuplicate)) {
      return res.status(400).json({ error: 'Duplicate phone numbers are not allowed' });
    }

    // Insert contact data into the database only if no duplicates are found
    const insertContactQuery = 'INSERT INTO contacts (name, email) VALUES (?, ?)';
    const [insertContactResult] = await db.execute(insertContactQuery, [name, email]);

    // Retrieve the inserted contact's ID
    const insertedContactId = insertContactResult.insertId;

    // Insert phone numbers into phone_numbers table
    const insertPhoneNumbersQuery = 'INSERT INTO phone_numbers (contact_id, phone_number) VALUES (?, ?)';
    for (const phoneNumber of phoneNumbers) {
      await db.execute(insertPhoneNumbersQuery, [insertedContactId, phoneNumber]);
    }

    // Send success response
    res.json({ message: 'Contact created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Delete Contact by ID
app.delete('/contacts/:id', async (req, res) => {
  try {
    const contactId = req.params.id;
    const deleteContactQuery = 'DELETE FROM contacts WHERE id = ?';
    const [result] = await db.query(deleteContactQuery, [contactId]);

    if (result.affectedRows === 1) {
      res.json({ message: 'Contact deleted successfully' });
    } else {
      res.status(404).json({ error: 'Contact not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Fetch All Contacts
app.get('/contacts', async (req, res) => {
  try {
    const getAllContactsQuery = 'SELECT * FROM contacts';
    const [contacts] = await db.query(getAllContactsQuery);

    for (const contact of contacts) {
      const getPhoneNumbersQuery = 'SELECT phone_number FROM phone_numbers WHERE contact_id = ?';
      const [phoneNumbersResult] = await db.query(getPhoneNumbersQuery, [contact.id]);
      contact.phoneNumbers = phoneNumbersResult.map(row => row.phone_number);
    }

    res.json(contacts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Search Contacts by Name or Phone Number
app.get('/contacts/search', async (req, res) => {
  try {
    const searchTerm = req.query.term;
    const searchContactsQuery = `
      SELECT c.*, pn.phone_number
      FROM contacts c
      LEFT JOIN phone_numbers pn ON c.id = pn.contact_id
      WHERE c.name LIKE ? OR c.email LIKE ? OR pn.phone_number LIKE ?`;

    const [searchResults] = await db.query(searchContactsQuery, [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]);

    // Organize search results by contact ID and include phone numbers
    const contactsMap = new Map();
    for (const result of searchResults) {
      const { id, name, email, phone_number } = result;
      if (!contactsMap.has(id)) {
        contactsMap.set(id, { id, name, email, phoneNumbers: [] });
      }
      if (phone_number) {
        contactsMap.get(id).phoneNumbers.push(phone_number);
      }
    }

    const contacts = Array.from(contactsMap.values());

    res.json(contacts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred' });
  }
});


// Update Contact by ID
app.put('/contacts/:id', async (req, res) => {
  try {
    const contactId = req.params.id;
    const { name, email, phoneNumbers } = req.body;

    // Fetch the existing contact details
    const getContactQuery = 'SELECT * FROM contacts WHERE id = ?';
    const [existingContact] = await db.query(getContactQuery, [contactId]);

    if (!existingContact.length) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // Update contact details if new details are provided
    const updatedName = name || existingContact[0].name;
    const updatedEmail = email || existingContact[0].email;

    const updateContactQuery = 'UPDATE contacts SET name = ?, email = ? WHERE id = ?';
    await db.query(updateContactQuery, [updatedName, updatedEmail, contactId]);

    // Update phone numbers if new numbers are provided
    if (phoneNumbers && phoneNumbers.length > 0) {
      // Delete existing phone numbers
      const deletePhoneNumbersQuery = 'DELETE FROM phone_numbers WHERE contact_id = ?';
      await db.query(deletePhoneNumbersQuery, [contactId]);

      // Insert new phone numbers
      const insertPhoneNumbersQuery = 'INSERT INTO phone_numbers (contact_id, phone_number) VALUES (?, ?)';
      for (const phoneNumber of phoneNumbers) {
        await db.query(insertPhoneNumbersQuery, [contactId, phoneNumber]);
      }
    }

    res.json({ message: 'Contact updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

// Export all contacts to CSV
app.get('/contacts/export/csv', async (req, res) => {
  try {
    const getAllContactsQuery = 'SELECT * FROM contacts';
    const [contacts] = await db.query(getAllContactsQuery);

    const csvFilePath = 'contacts.csv';

    const csvStream = csv.format({ headers: true });

    res.setHeader('Content-Disposition', `attachment; filename=${csvFilePath}`);
    res.setHeader('Content-Type', 'text/csv');
    csvStream.pipe(res);

    for (const contact of contacts) {
      const getPhoneNumbersQuery = 'SELECT phone_number FROM phone_numbers WHERE contact_id = ?';
      const [phoneNumbers] = await db.query(getPhoneNumbersQuery, [contact.id]);

      csvStream.write({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        phone_numbers: phoneNumbers.map(phone => phone.phone_number).join(', ') // Combine phone numbers
      });
    }

    csvStream.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
  });
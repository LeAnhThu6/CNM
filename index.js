import express from 'express'
// import data from './data.js'
import multer from 'multer'
import dotenv from 'dotenv'
dotenv.config()
import path from 'path'
import AWS from 'aws-sdk'
import { toASCII } from 'punycode'

const PORT = 3000
const app = express()

// cấu hinh AWS
process.env.AWS_SDK_JS_SUPPRESS_MAINTENCE_MODE_MESSAGE = '1'

/// cấu hình aws sdk để truy cập vào cloud AWs thông qua tài khoản IAM user
AWS.config.update({
  region: process.env.REGION,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
})
const s3 = new AWS.S3() // khai baso service s3
const dynamodb = new AWS.DynamoDB.DocumentClient() // khai báo service dynamodb

const bucketName = process.env.S3_BUCKET_NAME
const tableName = process.env.DYNAMODB_TABLE_NAME
console.log('tableName=', tableName)

// cấu hình multer
const storage = multer.memoryStorage({
  destination: function (req, file, cb) {
    cb(null, '')
  },
})
const upload = multer({
  storage: storage,
  limits: { fileSize: 2000000 }, // giới hạn file 2MB
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb)
  },
})
// hàm này có chức năng sẽ validate định danh file updalod có phải là ảnh không
function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/ // kiểm tra file có phải là ảnh không
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase())
  const mimetype = filetypes.test(file.mimetype)
  if (mimetype && extname) {
    return cb(null, true)
  }
  return cb('Error: Images Only!')
}

//register view engine
app.use(express.json({ extended: false }))
app.use(express.static('./views'))
app.use('/image', express.static('./image'))

//config view
app.set('view engine', 'ejs')
app.set('views', './views')

app.get('/', async (req, res) => {
 try{
    const params = { TableName:tableName};
    const data = await dynamodb.scan(params).promise();
    res.render('index', { data: data.Items })
    }catch(err){
      console.log(err);
      return res.status(500).send({error: 'Something went wrong'})
    }
})

app.post('/save', upload.single('fileimage'), (req, res) => {
    try{

      const id= Number(Date.now())
    const name = req.body.name
    const course_type = req.body.course_type
    const semester = req.body.semester
    const department = req.body.department
    const image = req.file?.originalname.split('.')
    const fileType = image[image.length - 1]
    const FilePAth = `${id}_${Date.now().toString()}_${fileType}`
    const paramsS3 = {
      Bucket: bucketName,
      Key: FilePAth,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }
     s3.upload(paramsS3, async (err, data) => {
      if (err) {
        console.log('Error uploading image to S3', err)
        return res.status(500).send('Internal Server Error')
      } else {
        // khi upload hình ảnh lên S3 thành công
        const imageUrl = data.Location // Gán URL S3 trả về vào field trong table Dy
        const paramsDynamoDB = {
          TableName: tableName,
          Item: {
            id: id,
            name: name,
            course_type: course_type,
            semester: semester,
            department: department,
            image: imageUrl,
          },
        }
         await dynamodb.put(paramsDynamoDB).promise() // lưu dữ liệu vào bảng
        console.log('Data saved to DynamoDB')
        return res.redirect('/') // gọi lại trang index để hiển thị lại data1
      }
    })
  } catch (error) {
    console.log('Error saving data to DynamoDB', error)
  }
    
})

 


app.post('/delete', upload.fields([]), async (req, res) => {
  const selectedCourseIds = Object.keys(req.body);
  if (!selectedCourseIds.length) {
    return res.redirect('/'); // No courses selected, redirect back
  }
  try {
    const deletePromises = selectedCourseIds.map(courseId =>
      dynamodb.delete({
        TableName: tableName,
        Key: { id: Number(courseId) },
      }).promise()
    );
    await Promise.all(deletePromises);
    console.log('Courses deleted successfully');
    res.redirect('/'); // Redirect back to index page
  } catch (error) {
    console.error('Error deleting courses:', error);
    res.status(500).send('Internal Server Error');
  }
});



app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
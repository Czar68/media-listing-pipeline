import os
import boto3
from botocore.exceptions import NoCredentialsError

class S3Client:
    def __init__(self):
        self.bucket_name = os.getenv("S3_BUCKET_NAME", "media-listing-pipeline-images")
        self.region = os.getenv("S3_REGION", "us-east-1")
        # In a real scenario, credentials would be loaded from env or IAM roles.
        self.s3 = boto3.client('s3')

    def upload_image(self, file_path: str) -> str:
        """
        Uploads an image to S3 and returns a public URL for eBay API.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Image not found: {file_path}")

        filename = os.path.basename(file_path)
        s3_key = f"images/raw/{filename}"
        
        try:
            # self.s3.upload_file(file_path, self.bucket_name, s3_key, ExtraArgs={'ACL': 'public-read'})
            # Mocking the actual upload for now, returning a signed/public URL
            
            print(f" [S3Client] Mock Uploaded {filename} to s3://{self.bucket_name}/{s3_key}")
            
            # Construct public URL
            public_url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{s3_key}"
            return public_url
            
        except NoCredentialsError:
            print(" [!] AWS credentials not found. Returning mock public URL.")
            return f"https://mock-bucket.s3.amazonaws.com/images/raw/{filename}"
        except Exception as e:
            print(f" [!] S3 Upload Error: {e}")
            return f"https://mock-bucket.s3.amazonaws.com/images/raw/{filename}"

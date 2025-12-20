# Update CSS paths in all HTML files

$files = Get-ChildItem -Path "c:\Users\User\Desktop\JuicyPoint_MVP\*.html"

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    
    # Update style.css path
    $content = $content -replace 'href="style\.css', 'href="css/style.css'
    
    # Update css_chunk paths
    $content = $content -replace 'href="css_chunk', 'href="css/css_chunk'
    
    # Update css_sidebar.css path
    $content = $content -replace 'href="css_sidebar\.css', 'href="css/css_sidebar.css'
    
    # Save updated content
    Set-Content -Path $file.FullName -Value $content
    
    Write-Host "Updated: $($file.Name)"
}

Write-Host "`nAll HTML files updated successfully!"
